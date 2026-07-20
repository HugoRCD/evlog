import { telemetry } from '@evlog/telemetry'
import type { CliContext } from '../core/context'
import {
  DOCS_LABEL,
  DOCS_URL,
  createStyle,
  formatChecks,
  formatSummary,
  summarize,
} from '../core/output'
import type { Check, CheckSummary } from '../core/output'
import { defineEvlogCommand } from '../lib/command'
import type { CatalogFindingSource, CliDebug } from '../lib/debug'
import { createNoopCliDebug } from '../lib/debug'
import { cliErrors } from '../lib/errors'
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

function findingsForChecks(
  checks: Check[],
  resolved: Awaited<ReturnType<typeof resolveEvlog>>,
): Array<{ source: CatalogFindingSource, id: string, status: Check['status'] }> {
  const findings: Array<{ source: CatalogFindingSource, id: string, status: Check['status'] }> = []

  for (const check of checks) {
    if (check.status === 'ok') continue

    if (check.id === 'node' && check.status === 'fail') {
      findings.push({ source: cliErrors.NODE_TOO_OLD, id: check.id, status: check.status })
      continue
    }

    if (check.id === 'project') {
      findings.push({ source: cliErrors.PROJECT_NO_PACKAGE, id: check.id, status: check.status })
      continue
    }

    if (check.id === 'evlog') {
      findings.push({
        source: resolved.declared
          ? cliErrors.EVLOG_DECLARED_NOT_INSTALLED
          : cliErrors.EVLOG_NOT_FOUND,
        id: check.id,
        status: check.status,
      })
      continue
    }

    if (check.id === 'logs') {
      findings.push({ source: cliErrors.LOGS_SINK_MISSING, id: check.id, status: check.status })
    }
  }

  return findings
}

/**
 * Diagnose the evlog setup for `ctx.cwd` (monorepo-aware).
 * Pure with respect to the context: no printing, no `process.*` access.
 */
export async function runDoctor(
  ctx: CliContext,
  log: CliDebug = createNoopCliDebug(),
): Promise<DoctorResult> {
  const project = await log.step(
    'resolveProject',
    () => resolveProject(ctx.cwd),
    p => ({
      cwd: ctx.cwd,
      project: {
        kind: p.kind,
        root: p.root,
        packageDir: p.packageDir,
        name: p.packageName,
      },
    }),
  )

  const resolved = await log.step(
    'resolveEvlog',
    () => resolveEvlog(project),
    r => ({
      evlog: r.install
        ? { version: r.install.version, path: r.install.path }
        : { missing: true, declared: r.declared },
      resolveTried: r.tried,
    }),
  )

  const stack = await log.step(
    'detectStack',
    () => detectStack(project.packageJson),
    s => ({ stack: s }),
  )

  const checks = await log.step('checks', async () => {
    const environment: Check[] = [
      checkNode(ctx),
      checkProject(project),
    ]
    const stackCheck = checkStack(stack, !!resolved.install)
    if (stackCheck) environment.push(stackCheck)

    return [
      ...environment,
      checkEvlog(project, resolved),
      await checkLogs(project),
    ]
  })

  const sections = [
    {
      title: 'ENVIRONMENT',
      checks: checks.filter(c => c.id === 'node' || c.id === 'project' || c.id === 'stack'),
    },
    {
      title: 'EVLOG',
      checks: checks.filter(c => c.id === 'evlog' || c.id === 'logs'),
    },
  ]

  const summary = summarize(checks)

  for (const { source, id, status } of findingsForChecks(checks, resolved)) {
    log.finding(source, { id, status })
  }

  log.set({
    steps: ['done'],
    summary,
    checks: checks.map(c => ({ id: c.id, status: c.status })),
  })

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
    summary,
  }
}

/**
 * On-brand doctor report: sectioned checks + summary.
 * Command header is owned by {@link defineEvlogCommand}.
 */
export function formatDoctorReport(ctx: CliContext, result: DoctorResult): string {
  const { paint, link } = createStyle(ctx)
  const lines: string[] = []

  const where = result.project.kind === 'single'
    ? paint('dim', result.project.name ?? result.project.cwd)
    : paint('dim', `${result.project.kind} workspace`)
  lines.push(where, '')

  for (const section of result.sections) {
    lines.push(paint('dim', section.title))
    lines.push(formatChecks(ctx, section.checks), '')
  }

  lines.push(formatSummary(ctx, result.summary))
  lines.push(`${paint('dim', 'docs')} ${link(DOCS_URL, DOCS_LABEL)}`)
  lines.push('')

  return lines.join('\n')
}

/**
 * `evlog doctor` — diagnose the local evlog setup.
 * Logic lives in {@link runDoctor}; this file owns the citty surface.
 */
export default defineEvlogCommand('doctor', {
  meta: { name: 'doctor', description: 'Diagnose your evlog setup' },
  args: {
    cwd: { type: 'string', description: 'Project directory (default: current)' },
  },
  async run({ args, cli, log, ui }) {
    const cwd = typeof args.cwd === 'string' && args.cwd.length > 0 ? args.cwd : undefined
    const ctx = cwd ? { ...cli, cwd } : cli
    const result = await runDoctor(ctx, log)

    telemetry.set({
      checksFailed: result.summary.fail,
      checksWarned: result.summary.warn,
      workspace: result.project.kind !== 'single',
    })

    ui.done({
      jsonMode: args.json,
      json: {
        project: result.project,
        checks: result.checks,
        summary: result.summary,
      },
      human: formatDoctorReport(ctx, result),
      summary: result.summary,
    })
  },
})
