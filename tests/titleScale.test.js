import { describe, it, expect } from 'vitest'
import { titleScale } from '../src/lib/titleScale.js'

describe('titleScale', () => {
  it('leaves ordinary titles at full size', () => {
    // The overwhelming majority of real topics are short.
    for (const t of ['Kubernetes: regrets?', 'Do we still need staging?',
                     'Observability beyond dashboards']) {
      expect(titleScale(t)).toBe(1)
    }
  })

  it('steps down as titles get longer, never up', () => {
    const lengths = [10, 40, 41, 70, 71, 200]
    const scales = lengths.map((n) => titleScale('x'.repeat(n)))
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeLessThanOrEqual(scales[i - 1])
    }
    expect(scales.at(-1)).toBeLessThan(1)
  })

  it('never shrinks so far that the text is unreadable', () => {
    expect(titleScale('x'.repeat(500))).toBeGreaterThanOrEqual(0.5)
  })

  it('handles a missing title', () => {
    expect(titleScale(undefined)).toBe(1)
    expect(titleScale('')).toBe(1)
  })
})
