import { describe, it, expect } from 'vitest'
import { assignSlot, buildGrid } from '../src/lib/schedule.js'

const topics = (n) => Array.from({ length: n }, (_, i) => ({ id: `t${i + 1}`, rank: i + 1 }))

describe('assignSlot', () => {
  it('spreads the top picks across rounds, not across rooms', () => {
    // The whole point: with 3 rounds the top 3 land in Room 1 of each round, so
    // the most popular sessions never compete with each other.
    expect(assignSlot(0, 3)).toEqual({ round: 0, room: 0 })
    expect(assignSlot(1, 3)).toEqual({ round: 1, room: 0 })
    expect(assignSlot(2, 3)).toEqual({ round: 2, room: 0 })
    expect(assignSlot(3, 3)).toEqual({ round: 0, room: 1 })
    expect(assignSlot(4, 3)).toEqual({ round: 1, room: 1 })
  })

  it('degenerates sensibly to a single round', () => {
    expect(assignSlot(0, 1)).toEqual({ round: 0, room: 0 })
    expect(assignSlot(3, 1)).toEqual({ round: 0, room: 3 })
  })
})

describe('buildGrid', () => {
  it('fills a 3x3 grid in rank order down the rounds', () => {
    const grid = buildGrid(topics(9), 3, 3)
    expect(grid[0].map((t) => t.id)).toEqual(['t1', 't4', 't7'])
    expect(grid[1].map((t) => t.id)).toEqual(['t2', 't5', 't8'])
    expect(grid[2].map((t) => t.id)).toEqual(['t3', 't6', 't9'])
  })

  it('leaves empty cells when there are fewer topics than slots', () => {
    const grid = buildGrid(topics(7), 3, 3)
    expect(grid[1][2]).toBeNull()
    expect(grid[2][2]).toBeNull()
    expect(grid.flat().filter(Boolean)).toHaveLength(7)
  })

  it('drops topics beyond the available slots', () => {
    const grid = buildGrid(topics(50), 3, 4)
    expect(grid.flat().filter(Boolean)).toHaveLength(12)
  })

  it('never double-books a slot, for any shape', () => {
    for (let trial = 0; trial < 200; trial++) {
      const rounds = 1 + Math.floor(Math.random() * 6)
      const rooms = 1 + Math.floor(Math.random() * 6)
      const n = Math.floor(Math.random() * 40)
      const grid = buildGrid(topics(n), rounds, rooms)

      const placed = grid.flat().filter(Boolean)
      expect(placed).toHaveLength(Math.min(n, rounds * rooms))
      expect(new Set(placed.map((t) => t.id)).size).toBe(placed.length)
      expect(grid).toHaveLength(rounds)
      grid.forEach((row) => expect(row).toHaveLength(rooms))
    }
  })
})
