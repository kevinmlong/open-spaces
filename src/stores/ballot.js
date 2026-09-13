import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from './session'
import { useAuthStore } from './auth'

const MAX_PICKS = 3
const STORAGE_KEY = 'os.ballot.selection'

export const useBallotStore = defineStore('ballot', () => {
  const selected = ref(loadSelection())
  const hasVoted = ref(false)
  const submitting = ref(false)
  const myVotes = ref([])

  const remaining = computed(() => MAX_PICKS - selected.value.length)
  const isFull = computed(() => selected.value.length >= MAX_PICKS)

  function loadSelection() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    } catch {
      return []
    }
  }

  // Persist so a refresh mid-selection doesn't lose the picks.
  watch(
    selected,
    (v) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
      } catch {
        /* private browsing -- selection just won't survive a reload */
      }
    },
    { deep: true },
  )

  function toggle(topicId) {
    const i = selected.value.indexOf(topicId)
    if (i >= 0) selected.value = selected.value.filter((id) => id !== topicId)
    else if (!isFull.value) selected.value = [...selected.value, topicId]
  }

  function isSelected(topicId) {
    return selected.value.includes(topicId)
  }

  function clear() {
    selected.value = []
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  async function checkVoted() {
    const session = useSessionStore()
    const auth = useAuthStore()
    if (!session.sessionId || !auth.userId) return

    const { data } = await supabase
      .from('ballots')
      .select('submitted_at')
      .eq('session_id', session.sessionId)
      .eq('voter_id', auth.userId)
      .maybeSingle()
    hasVoted.value = !!data

    if (hasVoted.value) {
      const { data: votes } = await supabase
        .from('votes')
        .select('topic_id, slot')
        .eq('session_id', session.sessionId)
      myVotes.value = votes ?? []
    }
  }

  async function submit() {
    if (submitting.value || selected.value.length === 0) return
    submitting.value = true
    try {
      const { error } = await supabase.rpc('cast_ballot', { p_topic_ids: selected.value })
      if (error) {
        // A retry after an ambiguous timeout lands here. The ballot did commit,
        // so this is success, not failure.
        if (error.message?.includes('already_voted')) {
          hasVoted.value = true
          clear()
          await checkVoted()
          return
        }
        throw error
      }
      hasVoted.value = true
      clear()
      await checkVoted()
    } finally {
      submitting.value = false
    }
  }

  /**
   * Wipe everything when the room moves to a different session. Without this a
   * voter who voted on day 1 would still be marked as having voted on day 2.
   */
  function resetForNewSession() {
    clear()
    hasVoted.value = false
    myVotes.value = []
  }

  /** Drop picks that are no longer castable (merged/removed while offline). */
  function reconcile(activeIds) {
    if (!activeIds) return
    const set = new Set(activeIds)
    const kept = selected.value.filter((id) => set.has(id))
    if (kept.length !== selected.value.length) selected.value = kept
  }

  return {
    MAX_PICKS,
    selected,
    hasVoted,
    submitting,
    myVotes,
    remaining,
    isFull,
    toggle,
    isSelected,
    clear,
    checkVoted,
    submit,
    reconcile,
    resetForNewSession,
  }
})
