/**
 * Layout maths for the projector's topic wall: one hero card for the newest
 * idea, with everything else below it in a masonry grid.
 *
 * Pure so it can be unit-tested -- the failure mode here is text that overflows
 * or shrinks to nothing at some topic count nobody tried by hand.
 */

/**
 * Masonry column count. Few topics should read large and sparse; many need to
 * pack tighter or the wall scrolls forever.
 */
export function columnsFor(count) {
  if (count <= 2) return 1
  if (count <= 6) return 2
  if (count <= 14) return 3
  return 4
}

/**
 * The hero is the newest idea and the thing the room looks at, so it stays as
 * large as it can without wrapping into a wall of text.
 */
export function heroSizeClass(title) {
  const n = (title ?? '').length
  if (n <= 28) return 'text-8xl'
  if (n <= 55) return 'text-7xl'
  if (n <= 90) return 'text-6xl'
  return 'text-5xl'
}

/**
 * One size for every card in the wall, chosen only by how crowded it is.
 *
 * Sizing each card by its own title length made the wall look like a ransom
 * note -- the variation read as emphasis the topics didn't have. The hero is
 * where hierarchy lives; the wall is a flat list of equals.
 *
 * Indexed by column count 1-4.
 */
const ITEM_SIZES = ['text-4xl', 'text-3xl', 'text-2xl', 'text-xl']

export function itemSizeClass(columns = 3) {
  return ITEM_SIZES[Math.min(Math.max(columns, 1), ITEM_SIZES.length) - 1]
}

/**
 * The hero (newest) plus the full list.
 *
 * The newest topic deliberately appears in BOTH: it is the hero at the top and
 * the first card in the wall. Promoting it out of the list would make the wall
 * silently drop an entry, and once the hero is replaced a moment later the room
 * would see that topic appear to jump position rather than simply stay put.
 *
 * Expects newest-first, which is how the topics store sorts activeList.
 */
export function splitFeed(topics) {
  const items = topics ?? []
  return { hero: items[0] ?? null, items }
}
