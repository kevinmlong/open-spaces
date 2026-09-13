import { describe, it, expect } from 'vitest'
import { scheduleTitleClass, scheduleRoomClass } from '../src/lib/displayScale.js'

const px = (c) => ({
  'text-lg': 18, 'text-xl': 20, 'text-2xl': 24, 'text-3xl': 30, 'text-4xl': 36,
  'text-5xl': 48, 'text-6xl': 60, 'text-7xl': 72, 'text-base': 16, 'text-sm': 14, 'text-xs': 12,
})[c]

describe('schedule type scale', () => {
  it('grows the text as rooms get fewer and cards get taller', () => {
    for (const wide of [true, false]) {
      const sizes = [10, 8, 6, 4, 3, 2].map((n) => px(scheduleTitleClass(n, wide)))
      for (let i = 1; i < sizes.length; i++) {
        expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1])
      }
      // and it genuinely moves across the range, rather than being flat
      expect(sizes.at(-1)).toBeGreaterThan(sizes[0])
    }
  })

  it('is larger when a single round owns the full width', () => {
    for (const n of [2, 4, 6, 10]) {
      expect(px(scheduleTitleClass(n, true))).toBeGreaterThan(px(scheduleTitleClass(n, false)))
    }
  })

  it('keeps the room label quieter than the title', () => {
    for (const wide of [true, false]) {
      for (const n of [2, 4, 6, 10]) {
        expect(px(scheduleRoomClass(n, wide))).toBeLessThan(px(scheduleTitleClass(n, wide)))
      }
    }
  })

  it('never returns undefined, for any room count', () => {
    for (const n of [0, 1, 2, 5, 12, 50, -3]) {
      expect(px(scheduleTitleClass(n, true))).toBeDefined()
      expect(px(scheduleTitleClass(n, false))).toBeDefined()
      expect(px(scheduleRoomClass(n, true))).toBeDefined()
      expect(px(scheduleRoomClass(n, false))).toBeDefined()
    }
  })
})
