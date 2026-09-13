import { describe, it, expect } from 'vitest'
import { WALL_COLUMNS, ITEM_SIZE, heroSizeClass, splitFeed } from '../src/lib/wall.js'

const px = (cls) => ({
  'text-xl': 20, 'text-2xl': 24, 'text-3xl': 30, 'text-4xl': 36,
  'text-5xl': 48, 'text-6xl': 60, 'text-7xl': 72, 'text-8xl': 96,
})[cls]

describe('wall shape', () => {
  it('is a fixed three columns', () => {
    // Not derived from the topic count any more. A growing column count meant
    // the whole wall re-flowed whenever a topic arrived.
    expect(WALL_COLUMNS).toBe(3)
  })
  it('uses one card size for every topic', () => {
    expect(ITEM_SIZE).toMatch(/^text-/)
  })
})

describe('heroSizeClass', () => {
  it('shrinks as the newest idea gets wordier', () => {
    const sizes = ['Short one', 'x'.repeat(40), 'x'.repeat(70), 'x'.repeat(140)].map(
      (t) => px(heroSizeClass(t)),
    )
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThan(sizes[i - 1])
  })
  it('always outsizes a wall card, at every title length', () => {
    // The hero must never visually compete with the list below it.
    for (const t of ['Short', 'x'.repeat(40), 'x'.repeat(100), 'x'.repeat(200)]) {
      expect(px(heroSizeClass(t))).toBeGreaterThan(px(ITEM_SIZE))
    }
  })
  it('handles a missing title', () => {
    expect(px(heroSizeClass(undefined))).toBeDefined()
  })
})

describe('splitFeed', () => {
  const topics = (n) => Array.from({ length: n }, (_, i) => ({ id: i }))

  it('makes the newest topic the hero', () => {
    const { hero } = splitFeed(topics(5))
    expect(hero.id).toBe(0)
  })

  it('keeps the newest topic in the wall as well as the hero', () => {
    // Promoting it out of the list would make the wall drop an entry, and the
    // topic would appear to jump position once the hero moves on.
    const { hero, items } = splitFeed(topics(5))
    expect(items.map((t) => t.id)).toEqual([0, 1, 2, 3, 4])
    expect(items[0].id).toBe(hero.id)
  })

  it('shows every topic in the wall, whatever the count', () => {
    for (const n of [0, 1, 2, 30]) {
      expect(splitFeed(topics(n)).items).toHaveLength(n)
    }
  })

  it('copes with an empty or missing feed', () => {
    expect(splitFeed([])).toEqual({ hero: null, items: [] })
    expect(splitFeed(undefined)).toEqual({ hero: null, items: [] })
  })
})
