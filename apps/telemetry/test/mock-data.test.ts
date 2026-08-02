import { describe, expect, it } from 'vitest'
import { classifySource } from '../shared/utils/sources'
import { computeMockAdoption, computeMockRunsPage, computeMockStats, getMockRunDetail, getMockRuns } from '../server/utils/mock-data'

/**
 * The dataset deliberately spans more than the widest range (so the 30d view
 * has a previous window to compare against), which means "everything" and
 * "everything in range" are different sets — most assertions want the latter.
 */
function runsWithin(days: number) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return getMockRuns().filter(run => new Date(run.timestamp).getTime() >= cutoff)
}

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
  it('covers every run inside the 30d window', () => {
    const stats = computeMockStats({ range: '30d' })
    expect(stats.mock).toBe(true)
    expect(stats.totals.total).toBe(runsWithin(30).length)
    expect(stats.totals.success + stats.totals.errors).toBe(stats.totals.total)
  })

  it('compares against the preceding window of equal length', () => {
    const stats = computeMockStats({ range: '30d' })
    // Days 30-60 of the dataset — non-empty, and disjoint from the current window.
    expect(stats.previous.total).toBeGreaterThan(0)
    expect(stats.previous.total).toBe(runsWithin(60).length - runsWithin(30).length)
    expect(stats.previous.success + stats.previous.errors).toBe(stats.previous.total)
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
    // Timeline buckets are always pre-filled for the full range, even with zero runs.
    expect(stats.timeline).toHaveLength(30)
    expect(stats.timeline.every(point => point.success === 0 && point.errors === 0 && point.machines === 0)).toBe(true)
  })

  it('the timeline always covers the full range, zero-filled where there are no runs', () => {
    expect(computeMockStats({ range: '7d' }).timeline).toHaveLength(7)
    expect(computeMockStats({ range: '30d' }).timeline).toHaveLength(30)
    const week = computeMockStats({ range: '7d' })
    // Buckets are calendar days, while the range filter is an exact hour cutoff, so a
    // sliver of boundary runs can fall just outside the oldest bucket — the sum is a
    // lower bound on the total rather than an exact match.
    expect(week.timeline.reduce((sum, p) => sum + p.success + p.errors, 0)).toBeLessThanOrEqual(week.totals.total)
    // Bucket keys are contiguous, ascending calendar days.
    const buckets = week.timeline.map(p => p.bucket)
    expect(buckets).toEqual([...buckets].sort())
    expect(new Set(buckets).size).toBe(buckets.length)
  })

  it('carries per-bucket machines and duration percentiles for the sparklines', () => {
    const week = computeMockStats({ range: '7d' })
    const busiest = week.timeline.filter(p => p.success + p.errors > 0)
    expect(busiest.length).toBeGreaterThan(0)
    for (const point of busiest) {
      expect(point.machines).toBeGreaterThan(0)
      // Can't have seen more distinct machines than there were runs in the bucket.
      expect(point.machines).toBeLessThanOrEqual(point.success + point.errors)
      expect(point.avgDurationMs).toBeGreaterThan(0)
      expect(point.p95DurationMs).toBeGreaterThan(0)
    }
  })

  it('environment and tool breakdowns sum back up to the total', () => {
    const stats = computeMockStats({ range: '30d' })
    expect(stats.environments.reduce((sum, e) => sum + e.count, 0)).toBe(stats.totals.total)
    expect(stats.tools.reduce((sum, t) => sum + t.count, 0)).toBe(stats.totals.total)
  })

  it('source and os breakdowns sum back up to the total', () => {
    const stats = computeMockStats({ range: '30d' })
    expect(stats.sources.reduce((sum, s) => sum + s.count, 0)).toBe(stats.totals.total)
    expect(stats.os.reduce((sum, o) => sum + o.count, 0)).toBe(stats.totals.total)
  })

  it('classifies runs across every source kind, counting CI before agent', () => {
    const stats = computeMockStats({ range: '30d' })
    const kinds = new Set(stats.sources.map(s => s.kind))
    expect(kinds).toEqual(new Set(['ci', 'agent', 'terminal', 'automation']))

    // Precedence: nothing classified as an agent may have run in CI, or the CI
    // column would under-report every pipeline that uses one.
    const agentRuns = getMockRuns().filter((run) => {
      const source = classifySource(getMockRunDetail(run.id)!.env)
      return source.kind === 'agent'
    })
    expect(agentRuns.length).toBeGreaterThan(0)
    expect(agentRuns.every(run => getMockRunDetail(run.id)!.env.ci === false)).toBe(true)
  })

  it('filtering by source only returns runs from it', () => {
    const all = computeMockStats({ range: '30d' })
    const target = all.sources.find(s => s.kind === 'ci')!

    const filtered = computeMockStats({ range: '30d', source: { kind: target.kind, id: target.id } })
    expect(filtered.sources).toEqual([target])
    expect(filtered.totals.total).toBe(target.count)
  })

  it('filtering by terminal excludes agent-driven and CI runs', () => {
    const stats = computeMockStats({ range: '30d', source: { kind: 'terminal', id: 'terminal' } })
    expect(stats.sources.map(s => s.kind)).toEqual(['terminal'])
    expect(stats.totals.total).toBeGreaterThan(0)
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

  it('switches to hourly buckets on the 24h range only', () => {
    expect(computeMockStats({ range: '7d' }).granularity).toBe('day')
    const day = computeMockStats({ range: '24h' })
    expect(day.granularity).toBe('hour')
    expect(day.timeline).toHaveLength(24)
    expect(day.timeline.reduce((sum, p) => sum + p.success + p.errors, 0)).toBeLessThanOrEqual(day.totals.total)
  })

  it('exposes lastEventAt as the newest run timestamp', () => {
    const stats = computeMockStats({ range: '30d' })
    const newest = getMockRuns().map(r => r.timestamp).sort().at(-1)
    expect(stats.lastEventAt).toBe(newest)
  })

  it('reports p95 alongside the average for every top command', () => {
    const stats = computeMockStats({ range: '30d' })
    expect(stats.commands.length).toBeGreaterThan(0)
    for (const command of stats.commands) {
      expect(command.p95DurationMs).toBeGreaterThanOrEqual(command.avgDurationMs)
    }
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
    const total = runsWithin(30).length
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
    const total = runsWithin(30).length
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
    const total = runsWithin(30).length
    const pageSize = 50
    const lastPage = Math.ceil(total / pageSize)
    const result = computeMockRunsPage({ range: '30d' }, { sort: 'timestamp', order: 'desc', page: lastPage + 1, pageSize })
    expect(result.runs).toEqual([])
    expect(result.total).toBe(total)
  })
})

describe('computeMockAdoption', () => {
  it('plots one stacked point per timeline bucket, summing to the runs in range', () => {
    const adoption = computeMockAdoption({ range: '30d' })
    expect(adoption.mock).toBe(true)
    expect(adoption.versionAdoption).toHaveLength(30)
    expect(adoption.versions.length).toBeGreaterThan(1)

    const plotted = adoption.versionAdoption.reduce(
      (sum, point) => sum + Object.values(point.counts).reduce((a, b) => a + b, 0),
      0,
    )
    // Same calendar-day vs. exact-cutoff sliver as the activity timeline.
    expect(plotted).toBeLessThanOrEqual(computeMockStats({ range: '30d' }).totals.total)
  })

  it('every bucket carries a count for every series, so no band goes missing', () => {
    const adoption = computeMockAdoption({ range: '30d' })
    for (const point of adoption.versionAdoption) {
      expect(Object.keys(point.counts).sort()).toEqual([...adoption.versions].sort())
    }
  })

  it('counts a machine as new in exactly one bucket, and never more than the active ones', () => {
    const adoption = computeMockAdoption({ range: '30d' })
    for (const point of adoption.machines) {
      expect(point.new).toBeLessThanOrEqual(point.active)
    }
    // Machines join progressively over the dataset, so the 30d window sees some
    // arrive rather than every one of them being new on the oldest bucket.
    const fresh = adoption.machines.reduce((sum, point) => sum + point.new, 0)
    expect(fresh).toBeGreaterThan(0)
    expect(fresh).toBeLessThan(adoption.machines.reduce((sum, point) => sum + point.active, 0))
  })

  it('punchcard cells stay inside the ISO weekday/hour grid and sum to the total', () => {
    const adoption = computeMockAdoption({ range: '30d' })
    for (const cell of adoption.punchcard) {
      expect(cell.weekday).toBeGreaterThanOrEqual(1)
      expect(cell.weekday).toBeLessThanOrEqual(7)
      expect(cell.hour).toBeGreaterThanOrEqual(0)
      expect(cell.hour).toBeLessThanOrEqual(23)
    }
    const total = adoption.punchcard.reduce((sum, cell) => sum + cell.count, 0)
    expect(total).toBe(computeMockStats({ range: '30d' }).totals.total)
  })

  it('breaks flags and custom fields down by key and value', () => {
    const adoption = computeMockAdoption({ range: '30d' })
    expect(adoption.flags.map(f => f.key)).toContain('verbose')
    expect(adoption.custom.map(f => f.key)).toContain('cacheHit')

    for (const stat of [...adoption.flags, ...adoption.custom]) {
      expect(stat.values.length).toBeGreaterThan(0)
      expect(stat.count).toBe(stat.values.reduce((sum, v) => sum + v.count, 0))
      expect(stat.errors).toBeLessThanOrEqual(stat.count)
    }
  })

  it('returns an empty-but-valid shape for a tool that does not exist', () => {
    const adoption = computeMockAdoption({ range: '30d', tool: 'nonexistent-tool' })
    expect(adoption.flags).toEqual([])
    expect(adoption.custom).toEqual([])
    expect(adoption.punchcard).toEqual([])
    expect(adoption.machines).toHaveLength(30)
    expect(adoption.machines.every(point => point.active === 0 && point.new === 0)).toBe(true)
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
