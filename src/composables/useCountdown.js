import { computed } from 'vue'
import { useSessionStore } from '@/stores/session'

/** Formats the shared server-corrected countdown. The tick lives in the store. */
export function useCountdown() {
  const session = useSessionStore()

  const mmss = computed(() => {
    const ms = session.msRemaining
    if (ms === null) return null
    const total = Math.ceil(ms / 1000)
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${String(s).padStart(2, '0')}`
  })

  const expired = computed(() => session.expired)

  // Urgent while it is running out -- not once it has run out, which is its own
  // state with its own wording.
  const urgent = computed(
    () => session.msRemaining !== null && session.msRemaining <= 30000 && !session.expired,
  )

  /**
   * What to actually put on screen. A lapsed deadline sitting at "0:00" in
   * alarm-pink reads as a broken clock from the back of a room; saying so in
   * words reads as a deliberate state.
   */
  const text = computed(() => {
    if (mmss.value === null) return null
    return expired.value ? "Time's Up!" : mmss.value
  })

  return {
    mmss,
    text,
    urgent,
    expired,
    msRemaining: computed(() => session.msRemaining),
  }
}
