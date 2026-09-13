/**
 * Shrinks a card's text until it sits inside its box with room to breathe.
 *
 * The container-query sizing in DisplaySchedule gets the box right, but CSS
 * cannot see how many lines the text wrapped to: at four rounds by five rooms a
 * two-line title filled its card edge to edge with zero slack, which reads as
 * crammed even on a full screen. Only measurement knows, so this measures.
 *
 * It scales the container-derived size by a factor rather than setting pixels,
 * so the responsive behaviour stays in CSS and this only ever takes away what
 * does not fit.
 */
const MIN_SCALE = 0.45
/**
 * Fill at most this share of the card's height.
 *
 * 0.8 rather than something tighter because it was chosen from examples that
 * looked right on the projector: two-line titles that read well were filling
 * about 77% of their card, while the ones that looked crammed were at 100%.
 */
const BREATHING = 0.8

function fitOne(card) {
  // The box the title has to live in, which is what is left after the room
  // label. The label is fixed, so only the title is ever scaled.
  const box = card.querySelector('[data-fit-box]')
  const title = box?.querySelector('.sched-title')
  if (!box || !title) return

  card.style.setProperty('--fit', '1')
  const available = box.clientHeight
  if (!available) return

  const fits = () => title.getBoundingClientRect().height <= available * BREATHING

  // Already comfortable at full size: the common case, one pass, no loop.
  if (fits()) return

  // Binary search the largest factor that fits. Six steps lands within ~1%.
  let lo = MIN_SCALE
  let hi = 1
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2
    card.style.setProperty('--fit', String(mid))
    if (fits()) lo = mid
    else hi = mid
  }
  card.style.setProperty('--fit', String(lo))
}

/**
 * Vue directive. Put it on each card; it fits on mount, whenever the card is
 * resized, and whenever its content changes.
 */
export const vFitText = {
  mounted(el) {
    const run = () => requestAnimationFrame(() => fitOne(el))
    run()
    // Inter loads asynchronously, and text measured in the fallback face gives
    // the wrong answer -- a card fitted too early stays slightly overfull.
    document.fonts?.ready.then(run)
    el._fitObserver = new ResizeObserver(run)
    el._fitObserver.observe(el)
  },
  updated(el) {
    requestAnimationFrame(() => fitOne(el))
  },
  unmounted(el) {
    el._fitObserver?.disconnect()
    delete el._fitObserver
  },
}
