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

const mountWall = (list) => mount(TopicWall, { props: { topics: list } })

const gridCols = (w) =>
  w.find('[data-test="wall"] > div').attributes('style') ?? ''

describe('TopicWall', () => {
  it('lays the wall out as a real three-column grid', () => {
    // The regression this exists for: a component referencing a prop key that no
    // longer existed left the column count undefined, no class was applied, and
    // the wall silently rendered as a plain vertical list.
    const w = mountWall(topics(20))
    expect(gridCols(w)).toContain('repeat(3,')
    expect(w.find('[data-test=\"wall\"] > div').classes()).toContain('grid')
  })

  it('keeps the same three columns at every topic count', () => {
    // A column count that grew with the list was what made the wall re-flow --
    // cards hopped between columns every time a topic arrived.
    for (const n of [1, 4, 12, 40]) {
      expect(gridCols(mountWall(topics(n)))).toContain('repeat(3,')
    }
  })

  it('puts the newest topic in the first cell', () => {
    // Newest-first, filling left to right: the new one takes the top-left cell.
    const cards = mountWall(topics(7)).findAll('[data-test=\"wall\"] > div > div')
    expect(cards[0].text()).toContain('Topic number 0')
    expect(cards[1].text()).toContain('Topic number 1')
  })

  it('does not auto-scroll, but stays scrollable by hand', () => {
    const cls = mountWall(topics(40)).find('[data-test=\"wall\"]').classes().join(' ')
    expect(cls).toContain('overflow-y-auto')
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
    const cards = mountWall(topics(20)).findAll('[data-test=\"wall\"] > div > div')
    const sizes = cards.map((el) => el.classes().find((c) => /^text-\d?xl$/.test(c)))
    expect(sizes.length).toBeGreaterThan(1)
    expect(new Set(sizes).size).toBe(1)
  })

  it('reserves pink for the hero so the eye has one place to land', () => {
    const w = mountWall(topics(20))
    expect(w.find('[data-test=\"wall\"]').html()).not.toContain('bg-pink')
    expect(w.find('[data-test=\"hero\"]').classes().join(' ')).toContain('text-pink')
  })

  it('absorbs leftover height rather than growing the page', () => {
    const cls = mountWall(topics(40)).find('[data-test=\"wall\"]').classes().join(' ')
    expect(cls).toContain('min-h-0')
    expect(cls).toContain('flex-1')
  })
})
