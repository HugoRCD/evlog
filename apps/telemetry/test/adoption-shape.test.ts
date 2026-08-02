import { describe, expect, it } from 'vitest'
import { OTHER_VERSION, toFieldStats, toVersionAdoption } from '../shared/utils/adoption-shape'

describe('toVersionAdoption', () => {
  const keys = ['d1', 'd2', 'd3']

  it('turns long rows into one stacked point per bucket', () => {
    const { versions, points } = toVersionAdoption([
      { bucket: 'd1', version: '1.0.0', count: 5 },
      { bucket: 'd2', version: '1.0.0', count: 2 },
      { bucket: 'd2', version: '1.1.0', count: 8 },
    ], keys)

    // Ranked by total usage: 1.1.0 has 8 runs against 1.0.0's 7.
    expect(versions).toEqual(['1.1.0', '1.0.0'])
    expect(points.map(p => p.bucket)).toEqual(keys)
    expect(points[1]!.counts).toEqual({ '1.0.0': 2, '1.1.0': 8 })
  })

  it('zero-fills buckets with no runs, for every series', () => {
    const { points } = toVersionAdoption([{ bucket: 'd2', version: '1.0.0', count: 3 }], keys)
    expect(points[0]!.counts).toEqual({ '1.0.0': 0 })
    expect(points[2]!.counts).toEqual({ '1.0.0': 0 })
  })

  it('folds everything past the top five versions into one `other` band', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      bucket: 'd1',
      version: `1.${i}.0`,
      // Descending, so the ranking is unambiguous.
      count: 100 - i,
    }))

    const { versions, points } = toVersionAdoption(rows, keys)

    expect(versions).toEqual(['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', OTHER_VERSION])
    // The three versions outside the top five: 95 + 94 + 93.
    expect(points[0]!.counts[OTHER_VERSION]).toBe(282)
  })

  it('never emits an `other` band when every version fits', () => {
    const { versions } = toVersionAdoption([{ bucket: 'd1', version: '1.0.0', count: 1 }], keys)
    expect(versions).not.toContain(OTHER_VERSION)
  })
})

describe('toFieldStats', () => {
  it('groups values under their key and totals them', () => {
    const [stat] = toFieldStats([
      { key: 'format', value: 'json', count: 10, errors: 2 },
      { key: 'format', value: 'text', count: 4, errors: 0 },
    ])

    expect(stat!.key).toBe('format')
    expect(stat!.count).toBe(14)
    expect(stat!.errors).toBe(2)
    expect(stat!.values.map(v => v.value)).toEqual(['json', 'text'])
  })

  it('ranks keys and values by usage, most used first', () => {
    const stats = toFieldStats([
      { key: 'rare', value: 'a', count: 1, errors: 0 },
      { key: 'common', value: 'a', count: 3, errors: 0 },
      { key: 'common', value: 'b', count: 30, errors: 0 },
    ])

    expect(stats.map(s => s.key)).toEqual(['common', 'rare'])
    expect(stats[0]!.values.map(v => v.value)).toEqual(['b', 'a'])
  })

  it('caps keys at eight and values at six', () => {
    const rows = Array.from({ length: 12 }, (_, key) =>
      Array.from({ length: 9 }, (_, value) => ({ key: `k${key}`, value: `v${value}`, count: 100 - key, errors: 0 }))).flat()

    const stats = toFieldStats(rows)

    expect(stats).toHaveLength(8)
    expect(stats[0]!.values).toHaveLength(6)
    // The cap is display-only — the key's total still counts every value observed.
    expect(stats[0]!.count).toBe(900)
  })

  it('returns nothing for runs that carried no fields', () => {
    expect(toFieldStats([])).toEqual([])
  })
})
