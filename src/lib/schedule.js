/**
 * The spread assignment.
 *
 * Rank i (0-based) goes to round = i % rounds, room = floor(i / rounds).
 *
 * With 3 rounds that puts #1, #2 and #3 in Room 1 of Round 1, 2 and 3 -- so the
 * three most popular topics never run against each other. #4-#6 fill Room 2 of
 * each round, and so on.
 *
 * Kept pure and shared so the admin's preview grid and the server's
 * generate_schedule() cannot drift apart.
 */
export function assignSlot(index, rounds) {
  return {
    round: index % rounds,
    room: Math.floor(index / rounds),
  }
}

/**
 * Build the full round x room grid for a ranked topic list.
 * Returns grid[round][room] = topic | null.
 *
 * `pins` is the organizer's override: [{ topic_id, round, room }]. Pinned topics
 * take their cell outright (marked `pinned: true`); every other cell fills by
 * walking the spread order and handing each FREE slot the next unpinned topic.
 * The top topics therefore still avoid each other, just around the pins.
 *
 * Mirrors the fill in generate_schedule() (20260917000009_schedule_pins.sql).
 * Pins outside the grid are ignored here -- see outOfRangePins().
 */
export function buildGrid(rankedTopics, rounds, rooms, pins = []) {
  const grid = Array.from({ length: rounds }, () => Array.from({ length: rooms }, () => null))
  const byId = new Map(rankedTopics.map((t) => [t.id, t]))
  const pinnedIds = new Set()

  for (const pin of pins) {
    const topic = byId.get(pin.topic_id)
    if (!topic || pin.round >= rounds || pin.room >= rooms) continue
    grid[pin.round][pin.room] = { ...topic, pinned: true }
    pinnedIds.add(topic.id)
  }

  const rest = rankedTopics.filter((t) => !pinnedIds.has(t.id))
  let next = 0
  for (let i = 0; i < rounds * rooms && next < rest.length; i++) {
    const { round, room } = assignSlot(i, rounds)
    if (!grid[round][room]) grid[round][room] = rest[next++]
  }

  return grid
}

/** Pins that no longer fit after the organizer shrinks the grid. */
export function outOfRangePins(pins, rounds, rooms) {
  return pins.filter((p) => p.round >= rounds || p.room >= rooms)
}

/**
 * "Open Space 1", "Open Space 2"... unless the organizer has named the rooms.
 *
 * The default is the format the conference uses out loud, so an unnamed grid
 * still reads correctly from the back of the room. Anything the admin types in
 * `/admin/schedule` wins.
 */
export function roomName(session, roomIndex) {
  return session?.room_names?.[roomIndex] || `Open Space ${roomIndex + 1}`
}

export function roundLabel(session, roundIndex) {
  return session?.round_labels?.[roundIndex] || `Round ${roundIndex + 1}`
}
