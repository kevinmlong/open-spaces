/**
 * Type scale for the projector's schedule.
 *
 * The cards fill the available height with flexbox -- that part is CSS. What CSS
 * cannot do is pick a font size that suits the resulting card, so this does:
 * fewer rows means taller cards means bigger text. Without it, three rooms leave
 * a screen of half-empty boxes with small type marooned in them, and ten rooms
 * overflow.
 *
 * Pure, so the boundaries can be checked without a browser.
 */

/** Title size, by how many rooms share the column's height. */
const TITLE = [
  { rows: 2, wide: 'text-7xl', narrow: 'text-4xl' },
  { rows: 3, wide: 'text-6xl', narrow: 'text-4xl' },
  { rows: 4, wide: 'text-5xl', narrow: 'text-3xl' },
  { rows: 6, wide: 'text-4xl', narrow: 'text-2xl' },
  { rows: 8, wide: 'text-3xl', narrow: 'text-xl' },
  { rows: Infinity, wide: 'text-2xl', narrow: 'text-lg' },
]

/** The room name above it, always a step or two quieter. */
const ROOM = [
  { rows: 2, wide: 'text-3xl', narrow: 'text-lg' },
  { rows: 4, wide: 'text-2xl', narrow: 'text-base' },
  { rows: 6, wide: 'text-xl', narrow: 'text-sm' },
  { rows: Infinity, wide: 'text-lg', narrow: 'text-xs' },
]

const pick = (table, rows, wide) =>
  (table.find((r) => rows <= r.rows) ?? table[table.length - 1])[wide ? 'wide' : 'narrow']

/**
 * @param rows  how many cards share the vertical space
 * @param wide  true when one round owns the full width, false for the overview
 *              where several rounds share it
 */
export function scheduleTitleClass(rows, wide = false) {
  return pick(TITLE, Math.max(rows, 1), wide)
}

export function scheduleRoomClass(rows, wide = false) {
  return pick(ROOM, Math.max(rows, 1), wide)
}
