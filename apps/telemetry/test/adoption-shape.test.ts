import { describe, expect, it } from 'vitest'
import { OTHER_VERSION, mergeFieldValues, normalizeFlagKey, normalizeFlagRows, splitFieldStats, toFieldStats, toVersionAdoption } from '../shared/utils/adoption-shape'
import { PROMOTED_FIELD_KEYS } from '../shared/utils/field-dimensions'

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

describe('splitFieldStats', () => {
  /** A promoted key ranked below the eight busiest counters — the real shape. */
  function noisyRows() {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      key: `counter${i}`,
      value: '1',
      count: 500,
      errors: 0,
    }))
    return [
      ...rows,
      { key: 'mapFramework', value: 'nuxt', count: 9, errors: 1 },
      { key: 'mapFramework', value: 'next', count: 4, errors: 0 },
      { key: 'initFramework', value: 'nuxt', count: 2, errors: 0 },
    ]
  }

  it('keeps a promoted key that the top-keys cut would have dropped', () => {
    /* The whole reason the split exists: a tool reporting forty counters was
       pushing its own headline dimension out of the list. */
    const { dimensions, fields } = splitFieldStats(noisyRows(), PROMOTED_FIELD_KEYS)

    expect(dimensions.map(d => d.key)).toEqual(['mapFramework', 'initFramework'])
    expect(fields.map(f => f.key)).not.toContain('mapFramework')
    expect(toFieldStats(noisyRows()).map(f => f.key)).not.toContain('mapFramework')
  })

  it('caps the generic list but never a promoted key', () => {
    const values = Array.from({ length: 20 }, (_, i) => ({
      key: 'mapGrade',
      value: `band-${i}`,
      count: 1,
      errors: 0,
    }))
    const { dimensions, fields } = splitFieldStats([...noisyRows(), ...values], PROMOTED_FIELD_KEYS)

    expect(fields).toHaveLength(8)
    expect(dimensions.find(d => d.key === 'mapGrade')!.values).toHaveLength(20)
  })

  it('promotes nothing when no key is listed', () => {
    expect(splitFieldStats(noisyRows(), []).dimensions).toEqual([])
  })

  it('caps per reporting command, not across all of them', () => {
    /* `toFieldStats`'s single global top-8 makes the chattiest command starve
       every other one: forty `map*` counters would leave no room for `init`.
       The split caps each group on its own, so a command never disappears
       because another one reports more. */
    const chatty = Array.from({ length: 12 }, (_, i) => ({
      key: `mapCounter${i}`,
      value: '1',
      count: 900 + i,
      errors: 0,
    }))
    const quiet = [
      { key: 'initFramework', value: 'nuxt', count: 3, errors: 0 },
      { key: 'doctorEvlogFound', value: 'true', count: 2, errors: 0 },
    ]

    expect(toFieldStats([...chatty, ...quiet]).map(f => f.key))
      .not.toContain('doctorEvlogFound')

    const { fields } = splitFieldStats([...chatty, ...quiet], [])
    const keys = fields.map(f => f.key)
    expect(keys).toContain('doctorEvlogFound')
    expect(keys).toContain('initFramework')
    // map is still capped at 8 of its 12.
    expect(keys.filter(key => key.startsWith('mapCounter'))).toHaveLength(8)
  })
})

describe('mergeFieldValues', () => {
  it('adds up the same value reported under different keys', () => {
    /* `init` and `map` both answer "which framework"; the question wants one
       number per framework, not one per command. */
    const merged = mergeFieldValues([
      { key: 'initFramework', count: 3, errors: 0, values: [{ value: 'nuxt', count: 2, errors: 0 }, { value: 'next', count: 1, errors: 0 }] },
      { key: 'mapFramework', count: 9, errors: 2, values: [{ value: 'nuxt', count: 8, errors: 2 }, { value: 'next', count: 1, errors: 0 }] },
    ])

    expect(merged).toEqual([
      { value: 'nuxt', count: 10, errors: 2 },
      { value: 'next', count: 2, errors: 0 },
    ])
  })

  it('is empty when no key reported anything', () => {
    expect(mergeFieldValues([])).toEqual([])
  })
})

describe('normalizeFlagRows', () => {
  it('merges the kebab-case twin legacy clients reported under both spellings', () => {
    /* `@evlog/cli` < 0.5.0 sent raw citty args, so one flag arrived as both
       `no-header` and `noHeader`. The tally must add them up, not show twice. */
    expect(normalizeFlagRows([
      { key: 'no-header', value: 'true', count: 930, errors: 10 },
      { key: 'noHeader', value: 'true', count: 938, errors: 8 },
      { key: 'dryRun', value: 'true', count: 5, errors: 0 },
    ])).toEqual([
      { key: 'noHeader', value: 'true', count: 1868, errors: 18 },
      { key: 'dryRun', value: 'true', count: 5, errors: 0 },
    ])
  })

  it('drops the positional bucket a legacy client recorded as `_`', () => {
    expect(normalizeFlagRows([
      { key: '_', value: 'src/api', count: 4, errors: 0 },
      { key: 'json', value: 'true', count: 2, errors: 0 },
    ])).toEqual([
      { key: 'json', value: 'true', count: 2, errors: 0 },
    ])
  })

  it('spells any kebab-case key back as its camelCase name', () => {
    expect(normalizeFlagKey('min-score')).toBe('minScore')
    expect(normalizeFlagKey('no-header')).toBe('noHeader')
  })
})
