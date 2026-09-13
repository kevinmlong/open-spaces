/**
 * How much to shrink a projector title for its own length.
 *
 * The card sizing is container-relative (see DisplaySchedule.vue): the font is a
 * percentage of the card. That handles the box, but not what goes in it -- in a
 * narrow overview column a long title wraps to three or four lines and spills
 * out of a card that a short title fills comfortably.
 *
 * So the final size is `container-derived x this factor`. Short titles, which
 * are the overwhelming majority, keep the full container-derived size; only the
 * genuinely long ones step down, and they step down rather than being clipped or
 * truncated -- every word of a topic stays readable from the back of the room.
 */
export function titleScale(title) {
  const n = (title ?? '').length
  if (n <= 40) return 1
  if (n <= 70) return 0.78
  return 0.6
}
