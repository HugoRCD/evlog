import { defineCommand } from 'citty'
import { telemetry } from '@evlog/telemetry'
import { OUTPUT_PAD, formatCommandHeader, wantsHeader } from '../core/brand'
import { createContext } from '../core/context'
import type { CliContext } from '../core/context'
import {
  createStyle,
  exitCodeFor,
  summarize,
  writeHuman,
  writeJson,
} from '../core/output'
import type { Check, CheckSummary } from '../core/output'
import {
  detectStack,
  findLogsSink,
  prettyPath,
  resolveEvlog,
  resolveProject,
} from '../lib/project'
import type { ProjectInfo } from '../lib/project'

/** Typed result of `evlog doctor` — rendered by {@link formatDoctorReport}. */
export interface DoctorResult {
  project: {
    cwd: string
    root: string
    packageDir: string
    kind: string
    name: string | null
    stack: string[]
  }
  checks: Check[]
  sections: { title: string, checks: Check[] }[]
  summary: CheckSummary
}

const MIN_NODE_MAJOR = 20

function checkNode(ctx: CliContext): Check {
  const major = Number.parseInt(ctx.nodeVersion.replace(/^v/, ''), 10)
  if (Number.isNaN(major)) {
    return { id: 'node', status: 'warn', message: `unrecognized Node version ${ctx.nodeVersion}` }
  }
  if (major < MIN_NODE_MAJOR) {
    return {
      id: 'node',
      status: 'fail',
      message: `Node ${ctx.nodeVersion} is too old`,
      hint: `evlog CLI requires Node >= ${MIN_NODE_MAJOR}`,
    }
  }
  return { id: 'node', status: 'ok', message: ctx.nodeVersion }
}

function checkProject(project: ProjectInfo): Check {
  if (!project.packageJson) {
    return {
      id: 'project',
      status: 'warn',
      message: 'no package.json found',
      hint: 'run from your app or package directory',
    }
  }

  const name = project.packageName ?? prettyPath(project.root, project.packageDir)
  if (project.kind === 'single') {
    return { id: 'project', status: 'ok', message: name }
  }

  const where = prettyPath(project.root, project.packageDir)
  const scope = where === '.' ? 'workspace root' : where
  return {
    id: 'project',
    status: 'ok',
    message: `${name} · ${project.kind} · ${scope}`,
  }
}

function checkEvlog(
  project: ProjectInfo,
  resolved: Awaited<ReturnType<typeof resolveEvlog>>,
): Check {
  const { install, declared } = resolved

  if (install) {
    const loc = prettyPath(project.root, install.path)
    const range = install.declaredRange ? ` (${install.declaredRange})` : ''
    return {
      id: 'evlog',
      status: 'ok',
      message: `v${install.version}${range}`,
      hint: loc !== '.' ? `resolved from ${loc}` : undefined,
    }
  }

  if (declared) {
    return {
      id: 'evlog',
      status: 'warn',
      message: `declared ${declared.range} but not installed`,
      hint: 'run your package manager install step',
    }
  }

  return {
    id: 'evlog',
    status: 'warn',
    message: 'not found in this project',
    hint: 'pnpm add evlog — https://evlog.dev/getting-started/installation',
  }
}

function checkStack(stack: string[], hasEvlog: boolean): Check | null {
  if (stack.length === 0) return null
  const labels = stack.join(', ')
  if (hasEvlog) {
    return { id: 'stack', status: 'ok', message: labels }
  }
  return {
    id: 'stack',
    status: 'warn',
    message: labels,
    hint: 'framework detected — add evlog and wire the matching integration',
  }
}

async function checkLogs(project: ProjectInfo): Promise<Check> {
  const sink = await findLogsSink(project)
  if (!sink) {
    return {
      id: 'logs',
      status: 'warn',
      message: 'no local sink yet',
      hint: 'created on first write by the fs drain (evlog/fs) → .evlog/logs',
    }
  }
  const loc = prettyPath(project.cwd, sink.dir)
  if (sink.files === 0) {
    return { id: 'logs', status: 'ok', message: `empty sink · ${loc}` }
  }
  return {
    id: 'logs',
    status: 'ok',
    message: `${sink.files} file${sink.files === 1 ? '' : 's'} · ${loc}`,
  }
}

/**
 * Diagnose the evlog setup for `ctx.cwd` (monorepo-aware).
 * Pure with respect to the context: no printing, no `process.*` access.
 */
export async function runDoctor(ctx: CliContext): Promise<DoctorResult> {
  const project = await resolveProject(ctx.cwd)
  const resolved = await resolveEvlog(project)
  const stack = detectStack(project.packageJson)

  const environment: Check[] = [
    checkNode(ctx),
    checkProject(project),
  ]
  const stackCheck = checkStack(stack, !!resolved.install)
  if (stackCheck) environment.push(stackCheck)

  const evlog: Check[] = [
    checkEvlog(project, resolved),
    await checkLogs(project),
  ]

  const sections = [
    { title: 'ENVIRONMENT', checks: environment },
    { title: 'EVLOG', checks: evlog },
  ]
  const checks = sections.flatMap(s => s.checks)

  return {
    project: {
      cwd: project.cwd,
      root: project.root,
      packageDir: project.packageDir,
      kind: project.kind,
      name: project.packageName,
      stack,
    },
    checks,
    sections,
    summary: summarize(checks),
  }
}

const SYMBOLS = {
  ok: { glyph: '✓', color: 'green' as const },
  warn: { glyph: '⚠', color: 'yellow' as const },
  fail: { glyph: '✗', color: 'red' as const },
}

/**
 * On-brand doctor report: shared command header (unless disabled), sectioned checks, summary.
 */
export function formatDoctorReport(ctx: CliContext, result: DoctorResult): string {
  const { paint, link } = createStyle(ctx)
  const pad = OUTPUT_PAD
  const lines: string[] = []

  if (wantsHeader(ctx)) {
    lines.push(formatCommandHeader(ctx, { command: 'doctor' }).trimEnd(), '')
  }

  const where = result.project.kind === 'single'
    ? paint('dim', result.project.name ?? result.project.cwd)
    : paint('dim', `${result.project.kind} workspace`)
  lines.push(`${pad}${where}`)
  lines.push('')

  for (const section of result.sections) {
    lines.push(`${pad}${paint('dim', section.title)}`)
    const idWidth = Math.max(...section.checks.map(c => c.id.length))
    for (const check of section.checks) {
      const { glyph, color } = SYMBOLS[check.status]
      const symbol = paint(color, glyph)
      const id = paint(['cyan'], check.id.padEnd(idWidth))
      lines.push(`${pad}${paint('blue', '│')} ${symbol} ${id}  ${check.message}`)
      if (check.hint) {
        lines.push(`${pad}${paint('blue', '│')}   ${paint('dim', `└ ${check.hint}`)}`)
      }
    }
    lines.push('')
  }

  const { summary } = result
  const parts = [
    paint(summary.ok > 0 ? 'green' : 'dim', `${summary.ok} ok`),
    paint(summary.warn > 0 ? 'yellow' : 'dim', `${summary.warn} warn`),
    paint(summary.fail > 0 ? 'red' : 'dim', `${summary.fail} fail`),
  ]
  lines.push(`${pad}${parts.join(paint('dim', ' · '))}`)
  lines.push(`${pad}${paint('dim', 'docs')} ${link('https://evlog.dev', 'evlog.dev')}`)
  lines.push('')

  return lines.join('\n')
}

/**
 * `evlog doctor` — diagnose the local evlog setup.
 * Logic lives in {@link runDoctor}; this file owns the citty surface.
 */
export default defineCommand({
  meta: { name: 'doctor', description: 'Diagnose your evlog setup' },
  args: {
    cwd: { type: 'string', description: 'Project directory (default: current)' },
    json: { type: 'boolean', description: 'Machine-readable JSON on stdout' },
  },
  async run({ args }) {
    const cwd = typeof args.cwd === 'string' && args.cwd.length > 0 ? args.cwd : undefined
    const ctx = createContext(cwd ? { cwd } : {})
    const result = await runDoctor(ctx)

    telemetry.set({
      checksFailed: result.summary.fail,
      checksWarned: result.summary.warn,
      workspace: result.project.kind !== 'single',
    })

    if (args.json) {
      writeJson({
        project: result.project,
        checks: result.checks,
        summary: result.summary,
      })
    } else {
      writeHuman(formatDoctorReport(ctx, result))
    }

    process.exitCode = exitCodeFor(result.summary)
  },
})
