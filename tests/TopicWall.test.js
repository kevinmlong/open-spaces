import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TopicWall from '../src/components/display/TopicWall.vue'

const topics = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    title: `Topic number ${i}`,
    source: i % 6 === 0 && i > 0 ? 'mic' : 'attendee',
    status: 'active',
  }))

const mountWall = (list) =>
  mount(TopicWall, { props: { topics: list, recentIds: new Set() } })

describe('TopicWall', () => {
  it('applies a real masonry column class', () => {
    // The regression this exists for: when the component referenced a prop key
    // that no longer existed, `columns` came back undefined, no columns-N class
    // was applied, and the masonry silently rendered as a plain vertical list.
    const w = mountWall(topics(20))
    expect(w.html()).toMatch(/columns-[1-4]/)
  })

  it('packs into more columns as the wall fills up', () => {
    const cols = (n) => mountWall(topics(n)).html().match(/columns-([1-4])/)[1]
    expect(Number(cols(2))).toBeLessThan(Number(cols(10)))
    expect(Number(cols(10))).toBeLessThan(Number(cols(30)))
  })

  it('shows the newest topic as the hero AND in the wall', () => {
    const w = mountWall(topics(5))
    expect(w.text()).toContain('Just proposed')
    // Newest is first in the feed; it should appear twice in the rendered text.
    const occurrences = w.text().split('Topic number 0').length - 1
    expect(occurrences).toBe(2)
  })

  it('renders every topic in the wall', () => {
    const w = mountWall(topics(12))
    for (let i = 0; i < 12; i++) expect(w.text()).toContain(`Topic number ${i}`)
  })

  it('renders nothing hero-shaped when there are no topics', () => {
    const w = mountWall([])
    expect(w.text()).not.toContain('Just proposed')
  })

  it('marks mic submissions', () => {
    expect(mountWall(topics(12)).text()).toContain('🎤')
  })

  it('gives every wall card the same type size', () => {
    const wall = mountWall(topics(20)).find('[data-test="wall"]')
    const sizes = wall.findAll('[class*="text-"]')
      .map((el) => el.classes().find((c) => /^text-(xs|sm|base|[0-9]?xl)$/.test(c)))
      .filter(Boolean)
    expect(sizes.length).toBeGreaterThan(1)
    expect(new Set(sizes).size).toBe(1)
  })

  it('reserves pink for the hero so the eye has one place to land', () => {
    const w = mountWall(topics(20))
    // The hero is the only pink thing on the screen. Wall cards used to flash
    // pink on arrival, which competed with it.
    const wall = w.find('[data-test="wall"]')
    expect(wall.html()).not.toContain('bg-pink')
    expect(w.find('[data-test="hero"]').classes().join(' ')).toContain('text-pink')
  })

  it('keeps the wall inside a scrollable, height-capped container', () => {
    // The wall must absorb leftover height and scroll -- never grow the page.
    const wall = mountWall(topics(40)).find('[data-test="wall"]')
    const cls = wall.classes().join(' ')
    expect(cls).toContain('overflow-y-hidden')
    expect(cls).toContain('min-h-0')
    expect(cls).toContain('flex-1')
  })
})
