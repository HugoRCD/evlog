import type { CliContext } from '../core/context'
import { CHECK_STATUS, createStyle } from '../core/output'
import type { CheckStatus } from '../core/output'

type FindingLike = {
  id?: unknown
  status?: unknown
  code?: unknown
  why?: unknown
  fix?: unknown
  link?: unknown
}

type AttemptLike = {
  base?: unknown
  method?: unknown
  ok?: unknown
  error?: unknown
}

function asStatus(value: unknown): CheckStatus {
  if (value === 'ok' || value === 'warn' || value === 'fail') return value
  return 'warn'
}

function shortPath(path: string, max = 64): string {
  if (path.length <= max) return path
  return `…${path.slice(-(max - 1))}`
}

/**
 * Human-readable debug case file for a CLI wide event.
 * Keeps the terminal scannable; full dump stays on `--json --debug` (stderr).
 */
export function formatDebugReport(
  event: Record<string, unknown>,
  ctx: Pick<CliContext, 'color'>,
): string {
  const { paint } = createStyle(ctx)
  const lines: string[] = ['']

  lines.push(paint('dim', '── debug ────────────────────────────────'))

  const command = typeof event.command === 'string' ? event.command : undefined
  const cwd = typeof event.cwd === 'string' ? event.cwd : undefined

  if (command) {
    lines.push(`${paint('dim', 'command')}  ${paint('cyan', command)}`)
  }
  if (cwd) {
    lines.push(`${paint('dim', 'cwd')}      ${cwd}`)
  }

  const steps = Array.isArray(event.steps) ? event.steps.map(String) : []
  if (steps.length > 0) {
    lines.push(
      `${paint('dim', 'steps')}    ${steps.map(s => paint('cyan', s)).join(paint('dim', ' → '))}`,
    )
  }

  const { error } = event
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>
    lines.push('')
    lines.push(paint('dim', 'error'))
    const code = typeof err.code === 'string' ? err.code : undefined
    const message = typeof err.message === 'string' ? err.message : undefined
    if (code) lines.push(`  ${paint('red', '✗')} ${paint('cyan', code)}`)
    if (message) lines.push(`    ${message}`)
    if (typeof err.why === 'string') lines.push(`    ${paint('dim', 'why')}  ${err.why}`)
    if (typeof err.fix === 'string') lines.push(`    ${paint('dim', 'fix')}  ${err.fix}`)
  }

  const findings = Array.isArray(event.findings) ? event.findings as FindingLike[] : []
  if (findings.length > 0) {
    lines.push('')
    lines.push(paint('dim', 'findings'))
    for (const finding of findings) {
      const status = asStatus(finding.status)
      const { glyph, color } = CHECK_STATUS[status]
      const code = typeof finding.code === 'string' ? finding.code : String(finding.id ?? 'unknown')
      lines.push(`  ${paint(color, glyph)} ${paint('cyan', code)}`)
      if (typeof finding.why === 'string') {
        lines.push(`    ${paint('dim', 'why')}  ${finding.why}`)
      }
      if (typeof finding.fix === 'string') {
        lines.push(`    ${paint('dim', 'fix')}  ${finding.fix}`)
      }
      if (typeof finding.link === 'string') {
        lines.push(`    ${paint('dim', 'link')} ${finding.link}`)
      }
    }
  }

  const tried = Array.isArray(event.resolveTried) ? event.resolveTried as AttemptLike[] : []
  if (tried.length > 0) {
    const okCount = tried.filter(t => t.ok === true).length
    lines.push('')
    lines.push(`${paint('dim', 'resolve')}  ${okCount}/${tried.length} probes ok`)

    const failed = tried.filter(t => t.ok !== true)
    const show = failed.slice(0, 4)
    for (const attempt of show) {
      const method = typeof attempt.method === 'string' ? attempt.method : '?'
      const base = typeof attempt.base === 'string' ? shortPath(attempt.base) : '?'
      const err = typeof attempt.error === 'string' ? paint('dim', ` · ${attempt.error}`) : ''
      lines.push(`  ${paint('dim', '·')} ${method} ${base}${err}`)
    }
    if (failed.length > show.length) {
      lines.push(paint('dim', `  · … ${failed.length - show.length} more`))
    }
  }

  lines.push(paint('dim', '──────────────────────────────────────────'))
  lines.push(paint('dim', 'full event → --json --debug  (stderr)'))
  lines.push('')
  return lines.join('\n')
}
