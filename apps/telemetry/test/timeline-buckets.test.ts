import { describe, expect, it } from 'vitest'
import { emptyActivityPoint, fillTimeline, timelineBucketKey, timelineBucketKeys, timelineGranularity } from '../shared/utils/timeline-buckets'

/** Fixed instant so bucket keys are asserted literally instead of re-derived from `Date.now()`. */
const NOW = Date.parse('2026-03-15T14:37:00.000Z')

describe('timelineGranularity', () => {
  it('only buckets by hour on the 24h range', () => {
    expect(timelineGranularity('24h')).toBe('hour')
    expect(timelineGranularity('7d')).toBe('day')
    expect(timelineGranularity('30d')).toBe('day')
  })
})

describe('timelineBucketKeys', () => {
  it('ends on the current bucket and runs oldest first', () => {
    const keys = timelineBucketKeys('7d', NOW)
    expect(keys).toHaveLength(7)
    expect(keys.at(-1)).toBe('2026-03-15')
    expect(keys[0]).toBe('2026-03-09')
    expect(keys).toEqual([...keys].sort())
  })

  it('emits 24 hourly keys with the SQL to_char format', () => {
    const keys = timelineBucketKeys('24h', NOW)
    expect(keys).toHaveLength(24)
    expect(keys.at(-1)).toBe('2026-03-15T14:00')
    expect(keys[0]).toBe('2026-03-14T15:00')
  })

  it('spans 30 distinct, contiguous days on the widest range', () => {
    const keys = timelineBucketKeys('30d', NOW)
    expect(keys).toHaveLength(30)
    expect(new Set(keys).size).toBe(30)
    expect(keys[0]).toBe('2026-02-14')
  })
})

describe('timelineBucketKey', () => {
  it('truncates a timestamp to its bucket', () => {
    expect(timelineBucketKey('2026-03-15T14:37:12.345Z', 'day')).toBe('2026-03-15')
    expect(timelineBucketKey('2026-03-15T14:37:12.345Z', 'hour')).toBe('2026-03-15T14:00')
  })
})

describe('fillTimeline', () => {
  it('keeps key order and fills the gaps', () => {
    const filled = fillTimeline(
      ['a', 'b', 'c'],
      [{ bucket: 'c', success: 3, errors: 1, machines: 2, avgDurationMs: 10, p95DurationMs: 20 }],
      emptyActivityPoint,
    )

    expect(filled.map(p => p.bucket)).toEqual(['a', 'b', 'c'])
    expect(filled[0]).toEqual(emptyActivityPoint('a'))
    expect(filled[2]!.success).toBe(3)
  })

  it('drops rows whose bucket is outside the range', () => {
    const filled = fillTimeline(['b'], [{ bucket: 'a', count: 1 }, { bucket: 'b', count: 2 }], bucket => ({ bucket, count: 0 }))
    expect(filled).toEqual([{ bucket: 'b', count: 2 }])
  })
})
