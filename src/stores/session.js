import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'

/**
 * The single source of truth. Every view derives what it renders from `phase`;
 * nothing in this app keeps its own "which screen am I on" flag.
 */
export const useSessionStore = defineStore('session', () => {
  const row = ref(null)
  const serverOffsetMs = ref(0)
  const presenceCount = ref(0)
  const stats = ref({ topicCount: 0, ballotCount: 0 })
  const tick = ref(Date.now())

  const sessionId = computed(() => row.value?.id ?? null)
  const phase = computed(() => row.value?.phase ?? null)

  const canPropose = computed(() => phase.value === 'proposals_open')
  const canVote = computed(() => phase.value === 'voting_open')
  const showResults = computed(() => ['voting_closed', 'scheduled'].includes(phase.value))
  const showSchedule = computed(() => phase.value === 'scheduled')

  const deadline = computed(() => {
    if (phase.value === 'proposals_open') return row.value?.proposals_deadline
    if (phase.value === 'voting_open') return row.value?.voting_deadline
    return null
  })

  /** Server time, not device time. Phones can be minutes off. */
  function serverNow() {
    return Date.now() + serverOffsetMs.value
  }

  const msRemaining = computed(() => {
    if (!deadline.value) return null
    void tick.value // re-evaluate on each clock tick
    return Math.max(0, new Date(deadline.value).getTime() - (Date.now() + serverOffsetMs.value))
  })

  const expired = computed(() => msRemaining.value !== null && msRemaining.value <= 0)

  async function syncClock() {
    const t0 = performance.now()
    const { data, error } = await supabase.rpc('server_now')
    if (error || !data) return
    const rtt = performance.now() - t0
    serverOffsetMs.value = new Date(data).getTime() + rtt / 2 - Date.now()
  }

  async function fetchActive() {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .is('archived_at', null)
      .maybeSingle()
    if (error) throw error

    // Never blank the screen on an empty result. There is a real window during
    // an archive swap where no session is visible, and assigning null here made
    // every view drop to its "starting soon" branch and snap back a moment
    // later -- which on a projector reads as a flicker.
    if (!data && row.value) return row.value

    row.value = data
    return data
  }

  function apply(next) {
    // Realtime payloads can arrive for an archived session mid-swap; ignore
    // anything that isn't the session we're tracking.
    if (!next) return
    if (row.value && next.id !== row.value.id) return
    row.value = { ...row.value, ...next }
  }

  async function pollStats() {
    if (!sessionId.value) return
    const { data } = await supabase.rpc('session_stats', { p_session: sessionId.value })
    const r = Array.isArray(data) ? data[0] : data
    if (r) stats.value = { topicCount: r.topic_count, ballotCount: r.ballot_count }
  }

  // --- admin actions -------------------------------------------------------
  async function setPhase(nextPhase, minutes = null, force = false) {
    const { data, error } = await supabase.rpc('set_phase', {
      p_session: sessionId.value,
      p_phase: nextPhase,
      p_minutes: minutes,
      p_force: force,
    })
    if (error) throw error
    apply(Array.isArray(data) ? data[0] : data)
  }

  async function extendDeadline(minutes) {
    const { data, error } = await supabase.rpc('extend_deadline', {
      p_session: sessionId.value,
      p_minutes: minutes,
    })
    if (error) throw error
    apply(Array.isArray(data) ? data[0] : data)
  }

  /**
   * Destructive, unlike archive: the data is gone. Scope is one of
   * 'schedule' | 'votes' | 'topics' | 'all'.
   */
  /**
   * What the projector shows during `scheduled`: null for the overview, or a
   * round index. Driven from the admin console, since the display laptop is
   * usually behind the stage.
   */
  async function setDisplayRound(round) {
    const { data, error } = await supabase.rpc('set_display_round', {
      p_session: sessionId.value,
      p_round: round,
    })
    if (error) throw error
    apply(Array.isArray(data) ? data[0] : data)
  }

  async function reset(scope) {
    const { data, error } = await supabase.rpc('reset_session', {
      p_session: sessionId.value,
      p_scope: scope,
    })
    if (error) throw error
    apply(Array.isArray(data) ? data[0] : data)
    return row.value
  }

  async function archiveAndStartNew(name) {
    const { data, error } = await supabase.rpc('archive_session', { p_new_name: name })
    if (error) throw error
    row.value = Array.isArray(data) ? data[0] : data
    return row.value
  }

  return {
    row,
    tick,
    serverOffsetMs,
    presenceCount,
    stats,
    sessionId,
    phase,
    canPropose,
    canVote,
    showResults,
    showSchedule,
    deadline,
    msRemaining,
    expired,
    serverNow,
    syncClock,
    fetchActive,
    apply,
    pollStats,
    setPhase,
    extendDeadline,
    setDisplayRound,
    reset,
    archiveAndStartNew,
  }
})
