import { EvlogError } from 'evlog'
import type { CliContext } from '../core/context'
import { createStyle, EXIT_FAIL } from '../core/output'
import { defineEvlogCommand } from '../lib/command'
import type { CliDebug } from '../lib/debug'
import { createNoopCliDebug } from '../lib/debug'
import { cliErrors } from '../lib/errors'
import { resolveEvlog, resolveProject } from '../lib/project'
import type { ProjectInfo } from '../lib/project'
import { detectFramework } from '../lib/map/detect'
import { classifyRouteObservability, gradeFromScore, routeCheckChips, topIssue } from '../lib/map/score'
import { scan } from '../lib/map/scan'
import { sensitivityBadge, sensitivityLabel } from '../lib/map/sensitivity'
import type { CheckId, CheckResult, Framework, RouteEntry, ScanContext, ScanResult } from '../lib/map/types'
import { frameworkLabel } from '../lib/map/utils'
import { writeMapFile } from '../lib/map/write'

const FRAMEWORKS: readonly Framework[] = ['nuxt', 'nitro', 'next', 'tanstack-start']

function isFramework(value: string): value is Framework {
  return (FRAMEWORKS as readonly string[]).includes(value)
}

/** Typed result of `evlog map` — rendered by {@link formatMapReport}. */
export interface MapResult {
  project: Pick<ProjectInfo, 'cwd' | 'root' | 'packageDir' | 'kind' | 'packageName'>
  framework: Framework
  frameworkWarnings: string[]
  scan: ScanResult
  /** Path `evlog.map.json` was written to, or `null` with `--no-write`. */
  mapPath: string | null
}

/**
 * Scan `ctx.cwd` for routes and score their wide-event coverage (monorepo-aware).
 * Pure with respect to the context except for the `evlog.map.json` write.
 */
export async function runMap(
  ctx: CliContext,
  log: CliDebug = createNoopCliDebug(),
  options: { framework?: Framework, noWrite?: boolean, verbose?: boolean } = {},
): Promise<MapResult> {
  const project = await log.step(
    'resolveProject',
    () => resolveProject(ctx.cwd),
    p => ({
      cwd: ctx.cwd,
      project: { kind: p.kind, root: p.root, packageDir: p.packageDir, name: p.packageName },
    }),
  )

  const { framework, warnings } = await log.step(
    'detectFramework',
    () => detectFramework(project, options.framework),
    r => ({ framework: r.framework, frameworkWarnings: r.warnings }),
  )

  const resolved = await log.step(
    'resolveEvlog',
    () => resolveEvlog(project),
    r => ({ hasEvlog: !!r.install }),
  )

  const scanCtx: ScanContext = {
    projectRoot: project.packageDir,
    framework,
    projectName: project.packageName ?? 'unknown',
    hasEvlog: !!resolved.install,
    verbose: options.verbose ?? false,
  }

  const scanResult = await log.step(
    'scan',
    () => scan(scanCtx),
    r => ({ routes: r.map.routes.length, score: r.map.score, grade: r.grade }),
  )

  let mapPath: string | null = null
  if (!options.noWrite) {
    mapPath = await log.step('writeMapFile', () => writeMapFile(project.packageDir, scanResult.map))
  }

  log.set({ steps: ['done'] })

  return {
    project,
    framework,
    frameworkWarnings: warnings,
    scan: scanResult,
    mapPath,
  }
}

const COL = { method: 6, path: 26, score: 5, badge: 2 } as const

function stripAnsi(text: string): string {
  return text.replace(/\u001B\[[0-9;]*m/g, '')
}

function padVisible(text: string, width: number): string {
  const len = stripAnsi(text).length
  if (len >= width) return text
  return text + ' '.repeat(width - len)
}

function truncateVisible(text: string, width: number): string {
  const plain = stripAnsi(text)
  if (plain.length <= width) return text
  return `${plain.slice(0, width - 1)}…`
}

function scoreBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width)
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${score}/100`
}

function gradeWord(grade: ReturnType<typeof gradeFromScore>): string {
  switch (grade) {
    case 'excellent': return 'excellent'
    case 'good': return 'good'
    case 'needs-work': return 'needs work'
    case 'at-risk': return 'at risk'
  }
}

interface Finding {
  text: string
  location: string
  impact: number
  kind: 'gap' | 'dark'
}

const CHECK_SHORT: Record<string, string> = {
  'wide-event': 'useLogger',
  'context': 'log.set',
  'structured-errors': 'createError',
  'audit': 'log.audit',
  'error-handling': 'error handling',
  'page-error-handling': 'fetch error handling',
}

function summarizeRouteFinding(route: RouteEntry): Finding | null {
  if (classifyRouteObservability(route) === 'exempt') return null

  const failed = (Object.entries(route.checks) as [CheckId, CheckResult | undefined][])
    .filter(([, c]) => c?.status === 'fail')
  if (failed.length === 0) return null

  const observability = classifyRouteObservability(route)
  const method = route.method ?? 'ANY'
  const sens = sensitivityLabel(route.sensitivity)
  const sensTag = sens ? ` (${sens})` : ''
  const line = failed[0]?.[1]?.evidence?.line ?? route.handler?.line ?? 1
  const chips = routeCheckChips(route)

  if (observability === 'instrumented' || observability === 'partial') {
    const gaps = failed.map(([id, c]) => CHECK_SHORT[id] ?? c?.message ?? id).join(', ')
    return {
      kind: 'gap',
      text: `${method} ${route.path}${sensTag} — has logger + context, missing: ${gaps}${chips ? ` · ${chips}` : ''}`,
      location: `${route.file}:${line}`,
      impact: observability === 'partial' ? 2 : 1,
    }
  }

  const issues = failed.map(([, c]) => c?.message ?? 'no observability').join('; ')
  return {
    kind: 'dark',
    text: `${method} ${route.path}${sensTag} — no observability: ${issues}`,
    location: `${route.file}:${line}`,
    impact: 4 + (route.sensitivity.level === 'high' ? 2 : 0),
  }
}

function collectFindings(routes: RouteEntry[]): Finding[] {
  const findings: Finding[] = []
  for (const route of routes) {
    const summary = summarizeRouteFinding(route)
    if (summary) findings.push(summary)
  }
  return findings.sort((a, b) => b.impact - a.impact)
}

/**
 * On-brand map report: score, route table (worst first), top findings.
 * Command header is owned by {@link defineEvlogCommand}.
 */
export function formatMapReport(ctx: CliContext, result: MapResult, options: { all?: boolean } = {}): string {
  const { paint } = createStyle(ctx)
  const { map, grade, summary } = result.scan
  const scoreColor = map.score >= 70 ? 'green' : map.score >= 50 ? 'yellow' : 'red'
  const lines: string[] = []

  lines.push(paint('dim', `${frameworkLabel(result.framework)} · ${map.projectName} · ${map.routes.length} routes`))
  for (const warning of result.frameworkWarnings) {
    lines.push(paint('yellow', `⚠ ${warning}`))
  }
  lines.push('')

  lines.push(`${paint('bold', String(map.score))} ${paint(scoreColor, gradeWord(grade))}`)
  lines.push(paint(scoreColor, scoreBar(map.score)))
  lines.push('')

  const summaryParts = [
    `${summary.instrumented} instrumented`,
    summary.partial > 0 ? `${summary.partial} partial` : null,
    summary.dark > 0 ? `${summary.dark} dark` : null,
    summary.exempt > 0 ? `${summary.exempt} exempt` : null,
  ].filter(Boolean).join(' · ')
  lines.push(paint('dim', summaryParts))
  lines.push(paint('dim', '$ money · A auth · o pii · CHECKS = logger · context · audit · errors · catch'))
  lines.push('')

  lines.push(paint('dim', 'ROUTES'))
  const headerRow = [
    padVisible('METHOD', COL.method),
    padVisible('PATH', COL.path),
    padVisible('SCORE', COL.score),
    padVisible('S', COL.badge),
    'CHECKS',
  ].join(' ')
  lines.push(paint('dim', headerRow))

  const sorted = [...map.routes].sort((a, b) => a.score - b.score)
  const shown = options.all ? sorted : sorted.slice(0, 15)

  for (const route of shown) {
    lines.push(formatRouteLine(ctx, route))
  }
  if (!options.all && sorted.length > 15) {
    lines.push(paint('dim', `… and ${sorted.length - 15} more (use --all)`))
  }
  lines.push('')

  lines.push(paint('dim', 'FINDINGS'))
  const findings = collectFindings(map.routes).slice(0, 5)
  if (findings.length === 0) {
    lines.push(paint('green', '✓ No issues'))
  } else {
    for (const finding of findings) {
      const icon = finding.kind === 'dark' ? paint('red', '✗') : paint('yellow', '!')
      lines.push(`${icon} ${finding.text}`)
      lines.push(`  ${paint('dim', '→')} ${paint('underline', finding.location)}`)
    }
  }
  lines.push('')

  if (result.mapPath) {
    lines.push(paint('dim', `Full map → ${result.mapPath}`))
  }
  lines.push(paint('dim', 'Run with --json for machine output'))

  return lines.join('\n')
}

function formatRouteLine(ctx: CliContext, route: RouteEntry): string {
  const { paint } = createStyle(ctx)
  const method = (route.method ?? 'ANY').padEnd(COL.method)
  const path = route.path.length > COL.path
    ? `…${route.path.slice(-(COL.path - 1))}`
    : route.path
  const scoreColor = route.score >= 70 ? 'green' : route.score >= 50 ? 'yellow' : 'red'
  const score = paint(scoreColor, String(route.score).padStart(3))
  const sens = sensitivityBadge(route.sensitivity)
  const observability = classifyRouteObservability(route)
  const badge = sens ? paint('magenta', sens) : observability === 'exempt' ? paint('dim', '○') : ' '

  const checksCol = (() => {
    if (observability === 'exempt') return paint('dim', 'exempt (evlog infra)')
    if (observability === 'instrumented' && route.score >= 100) return paint('green', 'ok')
    const chips = routeCheckChips(route)
    if (chips) {
      return paint(observability === 'dark' ? 'red' : 'yellow', truncateVisible(chips, 38))
    }
    return paint('red', truncateVisible(topIssue(route), 38))
  })()

  return [
    padVisible(method, COL.method),
    padVisible(path, COL.path),
    padVisible(score, COL.score),
    padVisible(badge, COL.badge),
    checksCol,
  ].join(' ')
}

function parseFrameworkArg(value: unknown): Framework | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  if (!isFramework(value)) {
    throw cliErrors.MAP_INVALID_FRAMEWORK({ value })
  }
  return value
}

/**
 * `evlog map` — static observability map: Lighthouse for wide events.
 * Logic lives in {@link runMap}; this file owns the citty surface.
 */
export default defineEvlogCommand('map', {
  meta: { name: 'map', description: 'Static observability map — Lighthouse for wide events' },
  args: {
    cwd: { type: 'string', description: 'Project directory (default: current)' },
    framework: { type: 'string', description: 'Override framework detection (nuxt, nitro, next, tanstack-start)' },
    all: { type: 'boolean', description: 'Show all routes in the report' },
    minScore: { type: 'string', description: 'Exit 1 if the global score is below this threshold' },
    // `default: true` + citty's `--no-write` negation — declaring this as `noWrite`
    // directly would not work: citty's parser treats any `--no-x` flag as negating
    // `x`, not as setting `noX` (see `wantsHeader`'s `--no-header` argv fallback).
    write: { type: 'boolean', default: true, description: 'Write evlog.map.json (--no-write to skip)' },
    verbose: { type: 'boolean', description: 'Show per-file parse warnings' },
  },
  async run({ args, cli, log, ui }) {
    const cwd = typeof args.cwd === 'string' && args.cwd.length > 0 ? args.cwd : undefined
    const ctx = cwd ? { ...cli, cwd } : cli

    let result: MapResult
    try {
      result = await runMap(ctx, log, {
        framework: parseFrameworkArg(args.framework),
        noWrite: !args.write,
        verbose: args.verbose,
      })
    } catch (error) {
      if (error instanceof EvlogError) {
        log.finding({ code: error.code ?? 'cli.MAP_FAILED', why: error.why, fix: error.fix, link: error.link }, { status: 'fail' })
        ui.done({
          jsonMode: args.json,
          json: { error: { code: error.code, message: error.message, why: error.why, fix: error.fix } },
          human: error.fix ? `${error.message}\n→ ${error.fix}` : error.message,
        })
        ui.exit(EXIT_FAIL)
        return
      }
      throw error
    }

    ui.done({
      jsonMode: args.json,
      json: { map: result.scan.map, summary: result.scan.summary, mapPath: result.mapPath },
      human: formatMapReport(ctx, result, { all: args.all }),
    })

    if (typeof args.minScore === 'string' && args.minScore.length > 0) {
      const threshold = Number.parseInt(args.minScore, 10)
      if (!Number.isNaN(threshold) && result.scan.map.score < threshold) {
        ui.exit(EXIT_FAIL)
      }
    }
  },
})
