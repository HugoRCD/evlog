import { EvlogError } from 'evlog'
import type { CliContext } from '../core/context'
import { EXIT_FAIL } from '../core/output'
import { defineEvlogCommand } from '../lib/command'
import type { CliDebug } from '../lib/debug'
import { createNoopCliDebug } from '../lib/debug'
import { cliErrors } from '../lib/errors'
import { resolveEvlog, resolveProject } from '../lib/project'
import type { ProjectInfo } from '../lib/project'
import { detectFramework } from '../lib/map/detect'
import {
  findEntryPoint,
  formatEntryPointNotFound,
  formatGate,
  formatMapInspect,
  formatMapMatrix,
  formatMapReport as formatMapReportView,
  formatMapWarnings,
} from '../lib/map/report'
import { scan } from '../lib/map/scan'
import type { Framework, ScanContext, ScanResult } from '../lib/map/types'
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

/**
 * Pick the view for the flags that were passed.
 *
 * The three views answer three different questions — "how am I doing", "show me
 * everything", "explain this one file" — so they are separate renderers rather
 * than one renderer with three modes. Rendering lives in `lib/map/report`; this
 * function only routes.
 */
export function formatMapReport(
  ctx: CliContext,
  result: MapResult,
  options: { all?: boolean, entry?: string, minScore?: number } = {},
): string {
  const sections: string[] = []

  /* Framework detection and disable-comment problems share one channel: both
     mean "the numbers below were produced under an assumption you should see",
     and both have to appear above every view rather than only the default one. */
  const warnings = [...result.frameworkWarnings, ...result.scan.warnings]
  if (warnings.length > 0) {
    sections.push(formatMapWarnings(ctx, warnings))
  }

  if (options.entry) {
    const route = findEntryPoint(result.scan, options.entry)
    sections.push(route
      ? formatMapInspect(ctx, result.scan, route)
      : formatEntryPointNotFound(ctx, result.scan, options.entry))
  } else if (options.all) {
    sections.push(formatMapMatrix(ctx, result.scan))
  } else {
    sections.push(formatMapReportView(ctx, result.scan, { mapPath: result.mapPath }))
  }

  if (options.minScore !== undefined) {
    sections.push(formatGate(ctx, result.scan, options.minScore))
  }

  return sections.join('\n')
}

function parseFrameworkArg(value: unknown): Framework | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  if (!isFramework(value)) {
    throw cliErrors.MAP_INVALID_FRAMEWORK({ value })
  }
  return value
}

function parseMinScoreArg(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const threshold = Number.parseInt(value, 10)
  return Number.isNaN(threshold) ? undefined : threshold
}

/**
 * `evlog map` — static observability map: Lighthouse for wide events.
 * Logic lives in {@link runMap}; this file owns the citty surface.
 */
export default defineEvlogCommand('map', {
  meta: { name: 'map', description: 'Static observability map — Lighthouse for wide events' },
  args: {
    entry: { type: 'positional', required: false, description: 'Inspect one entry point by route or file path' },
    cwd: { type: 'string', description: 'Project directory (default: current)' },
    framework: { type: 'string', description: 'Override framework detection (nuxt, nitro, next, tanstack-start)' },
    all: { type: 'boolean', description: 'Every entry point, as a check matrix' },
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

    const threshold = parseMinScoreArg(args.minScore)

    ui.done({
      jsonMode: args.json,
      json: { map: result.scan.map, summary: result.scan.summary, mapPath: result.mapPath },
      human: formatMapReport(ctx, result, {
        all: args.all,
        entry: typeof args.entry === 'string' && args.entry.length > 0 ? args.entry : undefined,
        minScore: threshold,
      }),
    })

    if (threshold !== undefined && result.scan.map.score < threshold) {
      ui.exit(EXIT_FAIL)
    }
  },
})
