import { onMounted, onUnmounted, watch } from 'vue'

/**
 * Scrolls a container's content steadily upward when it overflows, like credits
 * rolling, then rewinds quickly to the top and goes again.
 *
 * Two things here are load-bearing and both were learned the hard way:
 *
 * 1. POSITION IS TRACKED IN A FLOAT, not on the element. At 22px/s a 60fps frame
 *    advances ~0.37px; doing `el.scrollTop += 0.37` reads the value back rounded
 *    to 0, adds 0.37, writes 0.37, reads 0 again -- and the scroll sits at zero
 *    forever. Accumulating separately and assigning the total is what makes slow
 *    scrolling possible at all.
 *
 * 2. ONE DIRECTION, then a fast rewind. A bounce (up, then slowly back down)
 *    reads badly on a projector: the room cannot tell whether the list is
 *    advancing or rewinding, so they lose their place.
 *
 * It also resets to the top whenever the content changes, so a topic that has
 * just arrived is never left scrolled past, and does nothing at all when the
 * content fits rather than jittering.
 */
export function useAutoScroll(
  elRef,
  contentKeyRef,
  { speed = 24, rewindSpeed = 700, pauseTop = 2000, pauseBottom = 3000 } = {},
) {
  let raf = null
  let phase = 'pauseTop' // pauseTop -> scrolling -> pauseBottom -> rewinding
  let until = 0
  let last = 0
  let pos = 0 // the real position, in float pixels

  function step(ts) {
    const el = elRef.value
    if (!el) {
      raf = requestAnimationFrame(step)
      return
    }

    // Clamp: a backgrounded tab hands back an enormous delta on wake.
    const dt = last ? Math.min(ts - last, 100) : 0
    last = ts

    const max = el.scrollHeight - el.clientHeight
    if (max <= 1) {
      pos = 0
      el.scrollTop = 0
      phase = 'pauseTop'
      until = ts + pauseTop
      raf = requestAnimationFrame(step)
      return
    }

    switch (phase) {
      case 'pauseTop':
        if (ts >= until) phase = 'scrolling'
        break

      case 'scrolling':
        pos += (speed * dt) / 1000
        if (pos >= max) {
          pos = max
          phase = 'pauseBottom'
          until = ts + pauseBottom
        }
        break

      case 'pauseBottom':
        if (ts >= until) phase = 'rewinding'
        break

      case 'rewinding':
        pos -= (rewindSpeed * dt) / 1000
        if (pos <= 0) {
          pos = 0
          phase = 'pauseTop'
          until = ts + pauseTop
        }
        break
    }

    // Content can shrink under us (a topic removed mid-scroll).
    pos = Math.max(0, Math.min(pos, max))
    el.scrollTop = pos

    raf = requestAnimationFrame(step)
  }

  function reset() {
    pos = 0
    phase = 'pauseTop'
    until = performance.now() + pauseTop
    if (elRef.value) elRef.value.scrollTop = 0
  }

  watch(contentKeyRef, reset)

  onMounted(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      raf = requestAnimationFrame(step)
    }
  })
  onUnmounted(() => cancelAnimationFrame(raf))

  return { reset }
}
