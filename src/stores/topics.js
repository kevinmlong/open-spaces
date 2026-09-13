import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from './session'

export const useTopicsStore = defineStore('topics', () => {
  const byId = ref(new Map())
  const pending = ref([]) // optimistic rows not yet confirmed by the server

  const all = computed(() => [...byId.value.values()])

  /** Newest first -- the live feed reads top-down as topics arrive. */
  const activeList = computed(() =>
    all.value
      .filter((t) => t.status === 'active')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  )

  /** Oldest first -- a stable ballot order, so the list doesn't reshuffle mid-vote. */
  const ballotList = computed(() =>
    all.value
      .filter((t) => t.status === 'active')
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
  )

  const removedList = computed(() => all.value.filter((t) => t.status === 'removed'))
  const mergedList = computed(() => all.value.filter((t) => t.status === 'merged'))

  async function fetch() {
    const session = useSessionStore()
    if (!session.sessionId) return
    const { data, error } = await supabase
      .from('topics')
      .select('*')
      .eq('session_id', session.sessionId)
    if (error) throw error

    const next = new Map()
    for (const t of data) next.set(t.id, t)
    byId.value = next
    // Anything the server now knows about is no longer pending.
    pending.value = pending.value.filter(
      (p) => !data.some((t) => t.title === p.title && t.source === 'attendee'),
    )
  }

  function applyChange(payload) {
    const next = new Map(byId.value)
    if (payload.eventType === 'DELETE') {
      next.delete(payload.old?.id)
    } else {
      const row = payload.new
      next.set(row.id, row)
      // Reconcile the optimistic card: drop ours once the real row lands.
      pending.value = pending.value.filter((p) => p.title !== row.title)
    }
    byId.value = next
  }

  /**
   * Optimistic: the card shows immediately with a spinner. If the insert fails
   * the card is removed and the caller surfaces the error.
   */
  async function propose(title, source = 'attendee') {
    const session = useSessionStore()
    const clean = title.trim()
    const optimistic = { localId: crypto.randomUUID(), title: clean, source }
    if (source === 'attendee') pending.value = [optimistic, ...pending.value]

    const { data, error } = await supabase
      .from('topics')
      .insert({ session_id: session.sessionId, title: clean, source })
      .select()
      .single()

    if (error) {
      pending.value = pending.value.filter((p) => p.localId !== optimistic.localId)
      throw error
    }

    applyChange({ eventType: 'INSERT', new: data })
    pending.value = pending.value.filter((p) => p.localId !== optimistic.localId)
    return data
  }

  // --- admin curation ------------------------------------------------------
  async function remove(id, reason = null) {
    const { error } = await supabase.rpc('remove_topic', { p_id: id, p_reason: reason })
    if (error) throw error
  }

  async function restore(id) {
    const { error } = await supabase.rpc('restore_topic', { p_id: id })
    if (error) throw error
  }

  async function merge(fromId, intoId, newTitle = null) {
    const { error } = await supabase.rpc('merge_topics', {
      p_from: fromId,
      p_into: intoId,
      p_new_title: newTitle,
    })
    if (error) throw error
  }

  async function unmerge(id) {
    const { error } = await supabase.rpc('unmerge_topic', { p_id: id })
    if (error) throw error
  }

  async function similarPairs(threshold = 0.35) {
    const session = useSessionStore()
    const { data, error } = await supabase.rpc('similar_topics', {
      p_session: session.sessionId,
      p_threshold: threshold,
    })
    if (error) throw error
    return data ?? []
  }

  return {
    byId,
    pending,
    all,
    activeList,
    ballotList,
    removedList,
    mergedList,
    fetch,
    applyChange,
    propose,
    remove,
    restore,
    merge,
    unmerge,
    similarPairs,
  }
})
