import { describe, expect, it } from 'vitest'
import { computeMockRunsPage, computeMockStats, getMockRunDetail, getMockRuns } from '../server/utils/mock-data'

describe('getMockRuns', () => {
  it('generates a stable, non-empty dataset with sequential ids', () => {
    const runs = getMockRuns()
    expect(runs.length).toBeGreaterThan(0)
    expect(runs.map(r => r.id)).toEqual(runs.map((_, i) => i + 1))
  })

  it('is memoized across calls (same reference, same seed)', () => {
    expect(getMockRuns()).toBe(getMockRuns())
  })

  it('every run has plausible, well-typed fields', () => {
    for (const run of getMockRuns()) {
      expect(run.tool.length).toBeGreaterThan(0)
      expect(run.command.length).toBeGreaterThan(0)
      expect(['success', 'error']).toContain(run.outcome)
      expect(run.durationMs).toBeGreaterThan(0)
      expect(new Date(run.timestamp).toString()).not.toBe('Invalid Date')
      if (run.outcome === 'error') expect(run.errorCode).not.toBeNull()
      else expect(run.errorCode).toBeNull()
    }
  })
})

describe('computeMockStats', () => {
  it('covers the full dataset over a 30d range', () => {
    const stats = computeMockStats({ range: '30d' })
    expect(stats.mock).toBe(true)
    expect(stats.totals.total).toBe(getMockRuns().length)
    expect(stats.totals.success + stats.totals.errors).toBe(stats.totals.total)
  })

  it('narrower ranges never include more runs than wider ones', () => {
    const day = computeMockStats({ range: '24h' }).totals.total
    const week = computeMockStats({ range: '7d' }).totals.total
    const month = computeMockStats({ range: '30d' }).totals.total
    expect(day).toBeLessThanOrEqual(week)
    expect(week).toBeLessThanOrEqual(month)
  })

  it('filtering by tool only returns runs for that tool', () => {
    const stats = computeMockStats({ range: '30d', tool: 'evlog-cli' })
    expect(stats.tools).toEqual([{ tool: 'evlog-cli', count: stats.totals.total }])
  })

  it('filtering by environment only returns runs for that environment', () => {
    const stats = computeMockStats({ range: '30d', environment: 'production' })
    expect(stats.environments).toEqual([{ environment: 'production', count: stats.totals.total }])
  })

  it('returns an empty-but-valid shape for a tool that does not exist', () => {
    const stats = computeMockStats({ range: '30d', tool: 'nonexistent-tool' })
    expect(stats.totals.total).toBe(0)
    expect(stats.environments).toEqual([])
    expect(stats.commands).toEqual([])
    // Daily buckets are always pre-filled for the full range, even with zero runs.
    expect(stats.daily).toHaveLength(30)
    expect(stats.daily.every(d => d.success === 0 && d.errors === 0)).toBe(true)
  })

  it('daily activity always covers the full range, zero-filled where there are no runs', () => {
    expect(computeMockStats({ range: '7d' }).daily).toHaveLength(7)
    expect(computeMockStats({ range: '30d' }).daily).toHaveLength(30)
    const week = computeMockStats({ range: '7d' })
    // Buckets are calendar days, while the range filter is an exact hour cutoff, so a
    // sliver of boundary runs can fall just outside the oldest bucket — the sum is a
    // lower bound on the total rather than an exact match.
    expect(week.daily.reduce((sum, d) => sum + d.success + d.errors, 0)).toBeLessThanOrEqual(week.totals.total)
    // Bucket keys are contiguous, ascending calendar days.
    const days = week.daily.map(d => d.day)
    expect(days).toEqual([...days].sort())
    expect(new Set(days).size).toBe(days.length)
  })

  it('environment and tool breakdowns sum back up to the total', () => {
    const stats = computeMockStats({ range: '30d' })
    expect(stats.environments.reduce((sum, e) => sum + e.count, 0)).toBe(stats.totals.total)
    expect(stats.tools.reduce((sum, t) => sum + t.count, 0)).toBe(stats.totals.total)
  })

  it('agent, os, and CI breakdowns sum back up to the total', () => {
    const stats = computeMockStats({ range: '30d' })
    expect(stats.agents.reduce((sum, a) => sum + a.count, 0)).toBe(stats.totals.total)
    expect(stats.os.reduce((sum, o) => sum + o.count, 0)).toBe(stats.totals.total)
    expect(stats.ci.ci + stats.ci.local).toBe(stats.totals.total)
    expect(stats.agents.some(a => a.agent === null)).toBe(true)
  })

  it('error codes only aggregate failed runs and carry a lastSeen timestamp', () => {
    const stats = computeMockStats({ range: '30d' })
    expect(stats.errorCodes.reduce((sum, e) => sum + e.count, 0)).toBe(stats.totals.errors)
    for (const entry of stats.errorCodes) {
      expect(entry.errorCode.length).toBeGreaterThan(0)
      expect(new Date(entry.lastSeen).toString()).not.toBe('Invalid Date')
    }
  })

  it('duration histogram covers every bucket and sums to the total, p50 ≤ p95', () => {
    const stats = computeMockStats({ range: '30d' })
    expect(stats.durations.histogram.length).toBeGreaterThan(0)
    expect(stats.durations.histogram.reduce((sum, b) => sum + b.count, 0)).toBe(stats.totals.total)
    expect(stats.durations.p50).toBeLessThanOrEqual(stats.durations.p95)
    expect(stats.durations.p50).toBeGreaterThan(0)
  })

  it('hourly activity is only populated on the 24h range, always covers 24 buckets', () => {
    expect(computeMockStats({ range: '7d' }).hourly).toEqual([])
    const day = computeMockStats({ range: '24h' })
    expect(day.hourly).toHaveLength(24)
    expect(day.hourly.reduce((sum, h) => sum + h.success + h.errors, 0)).toBeLessThanOrEqual(day.totals.total)
  })

  it('exposes lastEventAt as the newest run timestamp', () => {
    const stats = computeMockStats({ range: '30d' })
    const newest = getMockRuns().map(r => r.timestamp).sort().at(-1)
    expect(stats.lastEventAt).toBe(newest)
  })

  it('node versions are normalized to majors', () => {
    const stats = computeMockStats({ range: '30d' })
    for (const entry of stats.nodeVersions) {
      expect(entry.version).toMatch(/^\d+$/)
    }
    expect(stats.nodeVersions.reduce((sum, v) => sum + v.count, 0)).toBe(stats.totals.total)
  })
})

describe('computeMockRunsPage', () => {
  it('paginates through the full filtered set with no gaps or duplicates', () => {
    const pageSize = 50
    const seen = new Set<number>()
    const total = getMockRuns().length
    const pageCount = Math.ceil(total / pageSize)

    for (let page = 1; page <= pageCount; page++) {
      const result = computeMockRunsPage({ range: '30d' }, { sort: 'timestamp', order: 'desc', page, pageSize })
      for (const run of result.runs) {
        expect(seen.has(run.id)).toBe(false)
        seen.add(run.id)
      }
      expect(result.total).toBe(total)
    }

    expect(seen.size).toBe(total)
  })

  it('sorts by timestamp desc (newest first) by default', () => {
    const { runs } = computeMockRunsPage({ range: '30d' }, { sort: 'timestamp', order: 'desc', page: 1, pageSize: 20 })
    const timestamps = runs.map(r => r.timestamp)
    expect(timestamps).toEqual([...timestamps].sort().reverse())
  })

  it('sorts by durationMs asc when requested', () => {
    const { runs } = computeMockRunsPage({ range: '30d' }, { sort: 'durationMs', order: 'asc', page: 1, pageSize: 20 })
    const durations = runs.map(r => r.durationMs)
    expect(durations).toEqual([...durations].sort((a, b) => a - b))
  })

  it('the last page has no more than `pageSize` runs and `total` reflects the full filtered set', () => {
    const total = getMockRuns().length
    const pageSize = total + 10
    const result = computeMockRunsPage({ range: '30d' }, { sort: 'timestamp', order: 'desc', page: 1, pageSize })
    expect(result.total).toBe(total)
    expect(result.runs).toHaveLength(total)
  })

  it('returns no runs for a tool that does not exist', () => {
    const result = computeMockRunsPage({ range: '30d', tool: 'nonexistent-tool' }, { sort: 'timestamp', order: 'desc', page: 1, pageSize: 20 })
    expect(result.runs).toEqual([])
    expect(result.total).toBe(0)
  })

  it('returns an empty page past the end of the filtered set', () => {
    const total = getMockRuns().length
    const pageSize = 50
    const lastPage = Math.ceil(total / pageSize)
    const result = computeMockRunsPage({ range: '30d' }, { sort: 'timestamp', order: 'desc', page: lastPage + 1, pageSize })
    expect(result.runs).toEqual([])
    expect(result.total).toBe(total)
  })
})

describe('getMockRunDetail', () => {
  it('returns the full record for a valid id, including flags/custom/env', () => {
    const detail = getMockRunDetail(1)
    expect(detail).toBeDefined()
    expect(detail!.id).toBe(1)
    expect(detail!.idempotencyKey).toBe('mock-1')
    expect(detail!.flags).toBeTypeOf('object')
    expect(detail!.custom).toBeTypeOf('object')
    expect(detail!.env.node).toBeTypeOf('string')
    expect(typeof detail!.env.ci).toBe('boolean')
  })

  it('is consistent with the corresponding row in `getMockRuns()`', () => {
    const row = getMockRuns()[10]!
    const detail = getMockRunDetail(row.id)
    expect(detail).toMatchObject(row)
  })

  it('returns undefined for an id outside the dataset', () => {
    expect(getMockRunDetail(999_999)).toBeUndefined()
  })
})
