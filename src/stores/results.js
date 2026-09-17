import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useSessionStore } from './session'

export const useResultsStore = defineStore('results', () => {
  const rankings = ref([])
  const assignments = ref([])

  /**
   * Only succeeds once the embargo lifts (voting_closed / scheduled), or for an
   * admin. Attendees calling this during voting get zero rows -- by policy, not
   * by the UI choosing not to render them.
   */
  async function fetchRankings() {
    const session = useSessionStore()
    if (!session.sessionId) return
    const { data, error } = await supabase
      .from('topic_rankings')
      .select('*')
      .eq('session_id', session.sessionId)
      .order('rank', { ascending: true })
    if (error) throw error
    rankings.value = data ?? []
  }

  async function fetchAssignments() {
    const session = useSessionStore()
    if (!session.sessionId) return
    const { data, error } = await supabase
      .from('assignments')
      .select('*, topics(title, source)')
      .eq('session_id', session.sessionId)
      .order('round_index')
      .order('room_index')
    if (error) throw error
    assignments.value = data ?? []
  }

  /**
   * `pins` ([{ topic_id, round, room }]) are the organizer's overrides; the
   * server fills every other slot by rank around them.
   */
  async function generate(rounds, rooms, roomNames = null, roundLabels = null, pins = []) {
    const session = useSessionStore()
    const { error } = await supabase.rpc('generate_schedule', {
      p_session: session.sessionId,
      p_rounds: rounds,
      p_rooms: rooms,
      p_room_names: roomNames,
      p_round_labels: roundLabels,
      p_pins: pins,
    })
    if (error) throw error
    await session.fetchActive()
    await fetchAssignments()
  }

  return { rankings, assignments, fetchRankings, fetchAssignments, generate }
})
