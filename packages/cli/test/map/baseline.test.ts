import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { compareToBaseline, hasRegressed, loadBaseline } from '../../src/lib/map/baseline'
import type { BaselineSource } from '../../src/lib/map/baseline'
import type { CheckId, CheckResult, MapFile, RouteEntry } from '../../src/lib/map/types'

const SOURCE: BaselineSource = { kind: 'file', label: 'evlog.map.json' }

const tempDirs: string[] = []

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'evlog-cli-baseline-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

function route(path: string, checks: Partial<Record<CheckId, CheckResult>>, id = path, score = 100): RouteEntry {
  return {
    id,
    framework: 'nuxt',
    kind: 'api',
    method: 'POST',
    path,
    file: `server/api${path}.ts`,
    handler: null,
    checks,
    suggestions: {},
    sensitivity: { level: 'none', reasons: [] },
    score,
  }
}

function mapOf(routes: RouteEntry[], score = 80): MapFile {
  return {
    version: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    framework: 'nuxt',
    projectName: 'test',
    score,
    routes,
  }
}

describe('compareToBaseline', () => {
  it('reports a check that went from pass to fail', () => {
    const before = mapOf([route('/checkout', { 'wide-event': { status: 'pass' } })])
    const after = mapOf([route('/checkout', { 'wide-event': { status: 'fail' } }, '/checkout', 60)], 60)

    const comparison = compareToBaseline(before, after, SOURCE)

    expect(comparison.regressions).toEqual([expect.objectContaining({ path: '/checkout', check: 'wide-event', to: 'fail' }),])
    expect(comparison.delta).toBe(-40)
    expect(hasRegressed(comparison)).toBe(true)
  })

  it('treats silencing a passing check as a regression', () => {
    /* The escape hatch is the easiest way to make a gate green without writing
       any instrumentation, so a disable comment landing on top of a check that
       used to pass has to cost the same as breaking it. */
    const before = mapOf([route('/checkout', { audit: { status: 'pass' } })])
    const after = mapOf([route('/checkout', { audit: { status: 'n/a', suppressed: true } })])

    const comparison = compareToBaseline(before, after, SOURCE)

    expect(comparison.regressions).toEqual([expect.objectContaining({ check: 'audit', to: 'suppressed' }),])
  })

  it('does not gate on an exemption that was already there', () => {
    const before = mapOf([route('/health', { 'wide-event': { status: 'n/a', suppressed: true } })])
    const after = mapOf([route('/health', { 'wide-event': { status: 'n/a', suppressed: true } })])

    expect(hasRegressed(compareToBaseline(before, after, SOURCE))).toBe(false)
  })

  it('counts a fixed check without calling it a regression', () => {
    const before = mapOf([route('/checkout', { 'wide-event': { status: 'fail' } }, '/checkout', 40)])
    const after = mapOf([route('/checkout', { 'wide-event': { status: 'pass' } })], 95)

    const comparison = compareToBaseline(before, after, SOURCE)

    expect(comparison.regressions).toHaveLength(0)
    /* A fix is not a regression with the sign flipped: it carries no `to`, so
       a consumer of the JSON cannot read it as a check that broke. */
    expect(comparison.fixed).toEqual([expect.objectContaining({ path: '/checkout', check: 'wide-event' })])
    expect(comparison.fixed[0]).not.toHaveProperty('to')
    expect(comparison.delta).toBe(60)
    expect(hasRegressed(comparison)).toBe(false)
  })

  it('lists a new dark entry point without failing the gate', () => {
    /* An app that is not green yet adds endpoints at its current quality. If
       that failed CI, the gate would be turned off within a week — `--min-score`
       is where a bar for new work belongs. */
    const before = mapOf([route('/checkout', { 'wide-event': { status: 'pass' } })])
    const after = mapOf([
      route('/checkout', { 'wide-event': { status: 'pass' } }),
      route('/reports', { 'wide-event': { status: 'fail' } }),
    ])

    const comparison = compareToBaseline(before, after, SOURCE)

    expect(comparison.added).toEqual([expect.objectContaining({ path: '/reports', dark: true })])
    expect(hasRegressed(comparison)).toBe(false)
  })

  it('treats a deleted entry point as removed, not broken', () => {
    const before = mapOf([route('/legacy', { 'wide-event': { status: 'pass' } })])
    const after = mapOf([])

    const comparison = compareToBaseline(before, after, SOURCE)

    expect(comparison.removed).toEqual([{ path: '/legacy', method: 'POST' }])
    expect(comparison.regressions).toHaveLength(0)
  })

  it('fails when an entry point that survived lost score, with no check to name it', () => {
    const before = mapOf([route('/checkout', { 'wide-event': { status: 'pass' } })])
    const after = mapOf([route('/checkout', { 'wide-event': { status: 'pass' } }, '/checkout', 70)])

    expect(hasRegressed(compareToBaseline(before, after, SOURCE))).toBe(true)
  })

  it('does not let a new dark route drag the gate down', () => {
    /* The global score is a weighted average, so adding an uninstrumented
       endpoint lowers it on its own. Gating on that number would fail exactly
       the pull requests this comparison promises not to fail. */
    const before = mapOf([route('/checkout', { 'wide-event': { status: 'pass' } })], 100)
    const after = mapOf([
      route('/checkout', { 'wide-event': { status: 'pass' } }),
      route('/reports', { 'wide-event': { status: 'fail' } }, '/reports', 0),
    ], 50)

    const comparison = compareToBaseline(before, after, SOURCE)

    expect(comparison.totalDelta).toBe(-50)
    expect(comparison.delta).toBe(0)
    expect(hasRegressed(comparison)).toBe(false)
  })

  it('leaves an exempt new route out of the dark list', () => {
    /* A page that fetches nothing has nothing to log — the scan's classifier
       calls it exempt, and reporting it as needing instrumentation would be
       this comparison disagreeing with the report it sits under. */
    const before = mapOf([])
    const page: RouteEntry = {
      ...route('/about', { 'page-error-handling': { status: 'n/a' } }),
      kind: 'page',
      method: null,
    }
    const after = mapOf([page])

    const comparison = compareToBaseline(before, after, SOURCE)

    expect(comparison.added).toEqual([expect.objectContaining({ path: '/about', dark: false })])
  })
})

describe('loadBaseline', () => {
  it('reads the committed map from disk by default', async () => {
    const dir = await tempProject()
    await writeFile(join(dir, 'evlog.map.json'), JSON.stringify(mapOf([], 42)), 'utf8')

    const { map, source } = loadBaseline(dir)

    expect(map.score).toBe(42)
    expect(source).toEqual({ kind: 'file', label: 'evlog.map.json' })
  })

  /* Four git invocations, and git under parallel load on macOS is not quick —
     the default 5s is enough until something else is hammering the disk. */
  it('falls back to git when the working copy was already overwritten', { timeout: 30_000 }, async () => {
    const dir = await tempProject()
    const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
    await writeFile(join(dir, 'evlog.map.json'), JSON.stringify(mapOf([], 70)), 'utf8')
    git('init', '-q')
    git('add', '-A')
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base')
    await rm(join(dir, 'evlog.map.json'))

    const { map, source } = loadBaseline(dir)

    expect(map.score).toBe(70)
    expect(source).toEqual({ kind: 'git', label: 'git:HEAD' })
  })

  it('refuses a file that is not an evlog map', async () => {
    const dir = await tempProject()
    await writeFile(join(dir, 'other.json'), JSON.stringify({ hello: 'world' }), 'utf8')

    expect(() => loadBaseline(dir, 'other.json')).toThrow(/unusable/)
  })

  it('names the source it could not find', async () => {
    const dir = await tempProject()

    expect(() => loadBaseline(dir, 'missing.json')).toThrow(/missing\.json/)
  })
})
