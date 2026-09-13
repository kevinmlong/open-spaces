/**
 * Layout constants and maths for the projector's topic wall: one hero card for
 * the newest idea, with everything else below it in a fixed grid.
 *
 * Pure so it can be unit-tested -- the failure mode here is text that overflows
 * or shrinks to nothing at some topic count nobody tried by hand.
 */

/**
 * Fixed at three, deliberately.
 *
 * This used to be a CSS multi-column masonry whose column count grew with the
 * topic list. Multi-column *balances* content by height, so every arriving topic
 * re-flowed the entire wall: cards jumped between columns and the last column
 * visibly broke apart. A fixed three-column grid fills left-to-right in a stable
 * order -- a new topic takes the top-left cell and everything else shuffles
 * along by one, which is predictable and readable from the back of a room.
 */
export const WALL_COLUMNS = 3

/**
 * One size for every card in the wall.
 *
 * Sizing each card by its own title length made the wall look like a ransom
 * note -- the variation read as emphasis the topics didn't have. The hero is
 * where hierarchy lives; the wall is a flat list of equals.
 */
export const ITEM_SIZE = 'text-2xl'

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
