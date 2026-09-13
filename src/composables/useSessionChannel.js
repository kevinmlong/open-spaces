import { ref, watch, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'
import { useTopicsStore } from '@/stores/topics'
import { useResultsStore } from '@/stores/results'
import { useBallotStore } from '@/stores/ballot'

/**
 * The trickiest file in the app, and the one that decides whether this survives
 * conference wifi.
 *
 * Four things earn their keep here:
 *
 *   1. A FULL RESYNC on every SUBSCRIBED. Changes that happened while the socket
 *      was down are gone forever -- realtime will not replay them.
 *   2. A 5s polling fallback the moment the channel errors, so a dead socket
 *      degrades to a slower app rather than a frozen one.
 *   3. Jittered backoff. When the venue AP reboots, 300 devices reconnect at
 *      once; without jitter they stampede.
 *   4. Following the room into a new session when the old one is archived --
 *      see the watchers near the bottom.
 *
 * Presence has two distinct roles, and conflating them is why the headcount was
 * wrong for a while:
 *
 *   trackPresence   -- "I am a person in this room." Attendee pages only.
 *   observePresence -- "Tell me how many people are here." The projector, which
 *                      is furniture and must not count itself.
 *
 * The presence key is the attendee's anonymous auth id, so two tabs on one phone
 * count as one person rather than two. That is the number the room actually
 * wants: heads, not browser tabs.
 */
export function useSessionChannel({
  trackPresence = false,
  observePresence = false,
  pollStats = false,
} = {}) {
  const auth = useAuthStore()
  const session = useSessionStore()
  const topics = useTopicsStore()
  const results = useResultsStore()
  const ballot = useBallotStore()

  const status = ref('connecting') // connecting | live | degraded
  const lastSyncAt = ref(null)

  let channel = null
  let retries = 0
  let backoffTimer = null
  let pollTimer = null
  let statsTimer = null
  let clockTimer = null
  let sessionWatchTimer = null
  let subscribedSid = null
  let presenceZeroTimer = null
  let disposed = false

  async function resync() {
    try {
      await session.fetchActive()
      if (!session.sessionId) return
      await topics.fetch()
      if (session.showResults) await results.fetchRankings()
      if (session.showSchedule) await results.fetchAssignments()
      if (session.canVote || session.showResults) await ballot.checkVoted()
      ballot.reconcile(topics.ballotList.map((t) => t.id))
      lastSyncAt.value = Date.now()
    } catch {
      /* transient -- the poller or the next reconnect will pick it up */
    }
  }

  function startPolling() {
    if (pollTimer || disposed) return
    status.value = 'degraded'
    pollTimer = setInterval(resync, 5000)
  }

  function stopPolling() {
    clearInterval(pollTimer)
    pollTimer = null
  }

  function subscribe() {
    if (disposed || !session.sessionId) return
    const sid = session.sessionId
    // Idempotent. supabase-js caches channels by topic name, so calling .on()
    // on one that is already subscribed throws -- and that exception used to
    // escape into onMounted and kill every timer set up after it, including the
    // clock.
    if (channel && subscribedSid === sid) return
    subscribedSid = sid

    // A tracking client needs presence switched on explicitly; an observing one
    // gets it implicitly from its presence listener.
    const opts = trackPresence
      ? { config: { presence: { key: auth.userId ?? crypto.randomUUID(), enabled: true } } }
      : {}

    channel = supabase
      .channel(`os:${sid}`, opts)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sid}` },
        (p) => session.apply(p.new),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'topics', filter: `session_id=eq.${sid}` },
        (p) => {
          topics.applyChange(p)
          ballot.reconcile(topics.ballotList.map((t) => t.id))
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assignments', filter: `session_id=eq.${sid}` },
        () => results.fetchAssignments().catch(() => {}),
      )
      // Deliberately UNFILTERED, and the reason is subtle: an attendee cannot see
      // archived sessions (RLS), so the UPDATE that archives this one may never
      // be delivered to them at all -- the channel would simply go quiet forever
      // on stale content. The NEW session's INSERT, however, is visible to
      // everyone the moment it exists, so that is the reliable signal that the
      // room has moved on.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sessions' }, () =>
        resync(),
      )

    if (trackPresence || observePresence) {
      // Capture THIS channel rather than reading the outer variable: a sync from
      // a torn-down channel would otherwise read whatever replaced it, or throw
      // on null mid-teardown.
      const thisChannel = channel
      thisChannel.on('presence', { event: 'sync' }, () => {
        if (disposed || channel !== thisChannel) return
        // Keys are attendee identities, so this counts people, not connections.
        const count = Object.keys(thisChannel.presenceState()).length
        // A sync can briefly report nobody while a client is re-joining. Dropping
        // to zero unmounts the headcount and pops it back -- visible flicker on a
        // big screen -- so a transient zero is ignored and only a settled one is
        // believed.
        if (count === 0 && session.presenceCount > 0) {
          clearTimeout(presenceZeroTimer)
          presenceZeroTimer = setTimeout(() => {
            if (!disposed && channel === thisChannel) {
              session.presenceCount = Object.keys(thisChannel.presenceState()).length
            }
          }, 3000)
          return
        }
        clearTimeout(presenceZeroTimer)
        session.presenceCount = count
      })
    }

    channel.subscribe(async (s) => {
      if (disposed) return
      if (s === 'SUBSCRIBED') {
        retries = 0
        stopPolling()
        status.value = 'live'
        await resync()
        if (trackPresence) await channel.track({ at: Date.now() })
      } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(s)) {
        startPolling()
        scheduleReconnect()
      }
    })
  }

  function scheduleReconnect() {
    if (disposed) return
    clearTimeout(backoffTimer)
    const delay = Math.min(1000 * 2 ** retries++, 15000) + Math.random() * 500
    backoffTimer = setTimeout(async () => {
      await teardown()
      subscribe()
    }, delay)
  }

  async function teardown() {
    subscribedSid = null
    if (channel) {
      await supabase.removeChannel(channel)
      channel = null
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') {
      session.syncClock()
      resync()
    }
  }

  /**
   * If we DO see the archive, act on it immediately.
   *
   * Note this is the weaker of the two signals: attendees cannot select archived
   * sessions under RLS, so this event is not guaranteed to arrive. The unfiltered
   * sessions INSERT listener above is the one that reliably catches the handover;
   * this just makes it faster when the event does land.
   */
  watch(
    () => session.phase,
    async (phase) => {
      if (phase === 'archived') await resync()
    },
  )

  /**
   * Any change of session id means re-subscribing: the old channel's filters
   * point at a session nobody is using any more.
   */
  watch(
    () => session.sessionId,
    async (id, previous) => {
      if (!id || !previous || id === previous || disposed) return
      ballot.resetForNewSession()
      retries = 0
      await teardown()
      subscribe()
    },
  )

  function onOnline() {
    teardown().then(subscribe)
  }

  onMounted(async () => {
    // One shared 1Hz tick for every countdown in the app, rather than an
    // interval per component. Started FIRST and never behind an await that can
    // throw -- a frozen clock on the projector is highly visible.
    clockTimer = setInterval(() => {
      session.tick = Date.now()
    }, 1000)

    try {
      await session.syncClock()
      await session.fetchActive()
      subscribe()
    } catch {
      // The poller and the reconnect path will recover; the UI still ticks.
      startPolling()
    }

    if (pollStats) {
      session.pollStats()
      statsTimer = setInterval(() => session.pollStats(), 5000)
    }

    // Belt-and-braces for the one transition that strands a whole room: a slow
    // check that we are still following the live session. Realtime should make
    // this redundant, but a screen quietly showing yesterday's topics is the
    // kind of failure nobody notices until someone points at the projector.
    sessionWatchTimer = setInterval(() => {
      session.fetchActive().catch(() => {})
    }, 30000)

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
  })

  onUnmounted(() => {
    disposed = true
    clearTimeout(backoffTimer)
    clearInterval(clockTimer)
    clearInterval(statsTimer)
    clearInterval(sessionWatchTimer)
    clearTimeout(presenceZeroTimer)
    stopPolling()
    teardown()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
  })

  return { status, lastSyncAt, resync }
}
