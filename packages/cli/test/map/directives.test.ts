import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { formatMapReport, runMap } from '../../src/commands/map'
import type { MapResult } from '../../src/commands/map'
import { createContext } from '../../src/core/context'
import type { CliContext } from '../../src/core/context'
import {
  collectSuppressions,
  countSuppressed,
  parseDirective,
  suppressionMessage,
} from '../../src/lib/map/directives'
import { parseSource } from '../../src/lib/map/parse'
import { RULES } from '../../src/lib/map/rules/index'
import type { RouteEntry } from '../../src/lib/map/types'

const FIXTURES = join(import.meta.dirname, 'fixtures')
const KNOWN_IDS = RULES.map(rule => rule.id)

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

/** Suppressions of one snippet, collected the way a real scan collects them. */
function suppressionsOf(code: string) {
  const parsed = parseSource('server/api/thing.get.ts', code)
  if (!parsed) throw new Error('snippet did not parse')
  return collectSuppressions(parsed.comments, parsed.lines)
}

/**
 * Scan a throwaway copy of the nuxt fixture with extra handlers written into it.
 *
 * A copy rather than the fixture itself: the shared fixture is snapshotted by
 * other suites, and a directive added there would move every one of them.
 */
async function scanWith(files: Record<string, string>): Promise<{ ctx: CliContext, result: MapResult }> {
  const dir = await mkdtemp(join(tmpdir(), 'evlog-cli-directives-'))
  tempDirs.push(dir)
  await cp(join(FIXTURES, 'nuxt-basic'), dir, { recursive: true })
  await Promise.all(
    Object.entries(files).map(([file, code]) => writeFile(join(dir, file), code)),
  )

  const ctx = createContext({
    cwd: dir,
    env: {},
    nodeVersion: 'v22.0.0',
    tty: false,
    color: false,
    columns: 90,
  })
  return { ctx, result: await runMap(ctx, undefined, { noWrite: true }) }
}

function route(result: MapResult, file: string): RouteEntry {
  const found = result.scan.map.routes.find(entry => entry.file === file)
  if (!found) throw new Error(`no entry point for ${file}`)
  return found
}

describe('parseDirective', () => {
  it('reads the rule ids and the reason of a next-line directive', () => {
    const directive = parseDirective(' evlog-map-disable-next-line audit, context -- signed webhook', 12)

    expect(directive).toEqual({
      rules: ['audit', 'context'],
      line: 13,
      reason: 'signed webhook',
      declaredAt: 12,
    })
  })

  it('accepts ids separated by spaces as well as commas', () => {
    expect(parseDirective(' evlog-map-disable-next-line audit context', 1)?.rules).toEqual(['audit', 'context'])
  })

  it('covers every rule when the directive names none', () => {
    expect(parseDirective(' evlog-map-disable-next-line -- generated', 4)).toMatchObject({
      rules: null,
      line: 5,
      reason: 'generated',
    })
  })

  it('covers the whole file when there is no line suffix', () => {
    expect(parseDirective(' evlog-map-disable -- vendored', 1)).toMatchObject({ rules: null, line: null })
  })

  it('covers its own line for a trailing directive', () => {
    expect(parseDirective(' evlog-map-disable-line audit', 9)).toMatchObject({ line: 9, declaredAt: 9 })
  })

  it('stops the reason at the end of the directive line', () => {
    const directive = parseDirective(' evlog-map-disable-next-line audit -- known gap\n   more prose here ', 2)

    expect(directive?.reason).toBe('known gap')
  })

  it.each([
    ' eslint-disable-next-line no-console',
    ' evlog-map-disabled audit',
    ' TODO: evlog-map-disable audit',
    ' just a comment',
  ])('ignores %j, which is not a directive', (value) => {
    expect(parseDirective(value, 1)).toBeNull()
  })

  it('reads a reason that contains a double dash', () => {
    expect(parseDirective(' evlog-map-disable-next-line audit -- see ADR-4 -- accepted', 1)?.reason)
      .toBe('see ADR-4 -- accepted')
  })
})

describe('collectSuppressions', () => {
  it('finds a line directive by rule id and line', () => {
    const suppressions = suppressionsOf([
      '// evlog-map-disable-next-line audit -- internal tool',
      'export default defineEventHandler(() => ({ ok: true }))',
    ].join('\n'))

    expect(suppressions.at('audit', 2)).not.toBeNull()
    expect(suppressions.at('context', 2)).toBeNull()
    expect(suppressions.at('audit', 3)).toBeNull()
    expect(suppressions.file('audit')).toBeNull()
  })

  it('finds a file directive whatever line the rule points at', () => {
    const suppressions = suppressionsOf([
      '/* evlog-map-disable -- vendored file */',
      'export default defineEventHandler(() => ({ ok: true }))',
    ].join('\n'))

    expect(suppressions.file('wide-event')).not.toBeNull()
    expect(suppressions.at('wide-event', 2)).toBeNull()
  })

  it('reports an id no rule answers to, once', () => {
    const suppressions = suppressionsOf([
      '// evlog-map-disable-next-line wide-evnt',
      'const a = 1',
      '// evlog-map-disable-next-line wide-evnt, audit',
      'const b = 2',
    ].join('\n'))

    expect(suppressions.unknown(KNOWN_IDS)).toEqual([{ id: 'wide-evnt', declaredAt: 1 }])
  })

  it('says nothing about a file with no directives', () => {
    const suppressions = suppressionsOf('export default defineEventHandler(() => ({ ok: true }))')

    expect(suppressions.all).toEqual([])
    expect(suppressions.unknown(KNOWN_IDS)).toEqual([])
  })
})

describe('suppressionMessage', () => {
  it('names the line and the reason', () => {
    expect(suppressionMessage({ rules: ['audit'], line: 8, reason: 'signed webhook', declaredAt: 7 }))
      .toBe('disabled at line 7 — signed webhook')
  })

  it('holds up without a reason', () => {
    expect(suppressionMessage({ rules: null, line: null, reason: null, declaredAt: 1 }))
      .toBe('disabled for this file')
  })
})

describe('a disabled check', () => {
  it('is reported as n/a with its reason and costs no score', async () => {
    const { result } = await scanWith({
      'server/api/probe.get.ts': [
        '// evlog-map-disable-next-line wide-event, context -- liveness probe, deliberately silent',
        'export default defineEventHandler(() => ({ ok: true }))',
      ].join('\n'),
    })

    const probe = route(result, 'server/api/probe.get.ts')
    expect(probe.score).toBe(100)
    expect(probe.checks['wide-event']).toMatchObject({
      status: 'n/a',
      suppressed: true,
      message: 'disabled at line 1 — liveness probe, deliberately silent',
      evidence: { file: 'server/api/probe.get.ts', line: 1 },
    })
    expect(probe.checks.context?.suppressed).toBe(true)
    expect(countSuppressed(probe)).toBe(2)
  })

  it('covers every rule in the file when the directive names none', async () => {
    const { result } = await scanWith({
      'server/api/vendored.post.ts': [
        '/* evlog-map-disable -- generated by the SDK, do not instrument */',
        'export default defineEventHandler(async () => { throw new Error(\'boom\') })',
      ].join('\n'),
    })

    const vendored = route(result, 'server/api/vendored.post.ts')
    expect(vendored.score).toBe(100)
    /* Three rules had a finding here — logger, context, and the plain throw. */
    expect(vendored.checks['wide-event']?.suppressed).toBe(true)
    expect(vendored.checks.context?.suppressed).toBe(true)
    expect(vendored.checks['structured-errors']).toMatchObject({
      status: 'n/a',
      suppressed: true,
      message: 'disabled for this file — generated by the SDK, do not instrument',
    })
  })

  it('counts what was actually waived, not every rule in the file', async () => {
    const { result } = await scanWith({
      'server/api/vendored.post.ts': [
        '/* evlog-map-disable -- generated by the SDK */',
        'export default defineEventHandler(() => ({ ok: true }))',
      ].join('\n'),
    })

    const vendored = route(result, 'server/api/vendored.post.ts')
    /* `audit` and `error-handling` never applied to this handler, so they stay
       plain `n/a` — being inside a disabled file does not make them waived. */
    expect(vendored.checks.audit).toEqual({ status: 'n/a' })
    expect(vendored.checks['error-handling']).toEqual({ status: 'n/a' })
    expect(countSuppressed(vendored)).toBe(2)
  })

  it('leaves a check that would have passed as a pass', async () => {
    const { result } = await scanWith({
      'server/api/instrumented.post.ts': [
        '/* evlog-map-disable -- belt and braces */',
        'export default defineEventHandler((event) => {',
        '  const log = useLogger(event)',
        '  log.set({ ok: true })',
        '  return { ok: true }',
        '})',
      ].join('\n'),
    })

    const instrumented = route(result, 'server/api/instrumented.post.ts')
    expect(instrumented.checks['wide-event']?.status).toBe('pass')
    expect(countSuppressed(instrumented)).toBe(0)
  })

  it('leaves the checks on other lines alone', async () => {
    const { result } = await scanWith({
      'server/api/partial.get.ts': 'export default defineEventHandler(() => ({ ok: true })) // evlog-map-disable-line wide-event',
    })

    const partial = route(result, 'server/api/partial.get.ts')
    expect(partial.checks['wide-event']?.suppressed).toBe(true)
    expect(partial.checks.context?.status).toBe('fail')
    expect(partial.score).toBe(85)
  })

  it('does not silently swallow a typo — the check still fails and the scan warns', async () => {
    const { result } = await scanWith({
      'server/api/typo.get.ts': [
        '// evlog-map-disable-next-line wide-evnt',
        'export default defineEventHandler(() => ({ ok: true }))',
      ].join('\n'),
    })

    expect(route(result, 'server/api/typo.get.ts').checks['wide-event']?.status).toBe('fail')
    expect(result.scan.warnings).toEqual(['server/api/typo.get.ts:1 disables "wide-evnt", which is not a check evlog map runs',])
  })

  it('is counted in the summary and named in the report', async () => {
    const { ctx, result } = await scanWith({
      'server/api/probe.get.ts': [
        '// evlog-map-disable-next-line wide-event, context -- liveness probe',
        'export default defineEventHandler(() => ({ ok: true }))',
      ].join('\n'),
    })

    expect(result.scan.summary.suppressedChecks).toBe(2)
    const report = formatMapReport(ctx, result)
    expect(report).toContain('2 checks disabled by comment in 1 entry point')
    /* A disabled entry point is not solid: the rules never got to look at it. */
    expect(report).not.toContain('/api/probe')
  })

  it('shows up in the inspect view rather than disappearing from it', async () => {
    const { ctx, result } = await scanWith({
      'server/api/probe.get.ts': [
        '// evlog-map-disable-next-line wide-event, context -- liveness probe',
        'export default defineEventHandler(() => ({ ok: true }))',
      ].join('\n'),
    })

    const inspect = formatMapReport(ctx, result, { entry: 'server/api/probe.get.ts' })
    expect(inspect).toContain('○ useLogger')
    expect(inspect).toContain('disabled at line 1 — liveness probe')
    /* "Nothing to fix" would claim the requirements were met, not turned off. */
    expect(inspect).toContain('Nothing was checked here — 2 checks are disabled by comment.')
    expect(inspect).not.toContain('Nothing to fix')
  })

  it('still says what is left to fix when only one check is disabled', async () => {
    const { ctx, result } = await scanWith({
      'server/api/probe.get.ts': [
        '// evlog-map-disable-next-line wide-event -- liveness probe',
        'export default defineEventHandler(() => ({ ok: true }))',
      ].join('\n'),
    })

    const inspect = formatMapReport(ctx, result, { entry: 'server/api/probe.get.ts' })
    expect(inspect).toContain('○ useLogger')
    expect(inspect).toContain('✗ log.set')
  })

  it('offers the escape hatch next to a verdict the reader may disagree with', async () => {
    const { ctx, result } = await scanWith({})

    const inspect = formatMapReport(ctx, result, { entry: 'server/api/payments/stripe.post.ts' })
    expect(inspect).toContain('// evlog-map-disable-next-line wide-event -- why')
  })
})
