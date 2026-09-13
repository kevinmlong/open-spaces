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
 */
export function buildGrid(rankedTopics, rounds, rooms) {
  const grid = Array.from({ length: rounds }, () => Array.from({ length: rooms }, () => null))

  rankedTopics.slice(0, rounds * rooms).forEach((topic, i) => {
    const { round, room } = assignSlot(i, rounds)
    grid[round][room] = topic
  })

  return grid
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
