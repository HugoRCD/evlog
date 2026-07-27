import type { CliContext } from '../../core/context'
import { gradientRule, HEADER_GRADIENT_WIDTH } from '../../core/brand'
import { DOCS_URL, createStyle } from '../../core/output'
import type { InitResult } from './run'

function docLink(ctx: CliContext, path: string): string {
  const style = createStyle(ctx)
  return ctx.color ? style.link(`${DOCS_URL}${path}`, `evlog.dev${path}`) : `evlog.dev${path}`
}

const FRAMEWORK_DOCS: Record<string, string> = {
  nuxt: '/integrate/frameworks/nuxt',
  nitro: '/integrate/frameworks/nitro',
  next: '/integrate/frameworks/nextjs',
  'tanstack-start': '/integrate/frameworks/tanstack-start',
}

/**
 * What `init` did, in the order it did it.
 *
 * Every outcome gets a line, including the ones where nothing happened: a setup
 * command that prints only its writes leaves the reader unable to tell "already
 * wired" from "did not look".
 */
export function formatInitReport(ctx: CliContext, result: InitResult): string {
  const { paint } = createStyle(ctx)
  const lines: string[] = []

  lines.push(`${paint('dim', 'Detected')} ${paint('bold', result.framework)} ${paint('dim', `· service ${result.service}`)}`)
  lines.push('')

  const { install } = result
  if (install.status === 'already') {
    lines.push(`${paint('green', '✓')} evlog ${paint('dim', `already installed${install.version ? ` (${install.version})` : ''}`)}`)
  } else if (install.status === 'installed') {
    lines.push(`${paint('green', '✓')} ${paint('dim', `installed evlog · ${install.command}`)}`)
  } else if (install.status === 'skipped') {
    lines.push(`${paint('yellow', '·')} ${paint('dim', `evlog is not installed — run ${install.command}`)}`)
  } else {
    lines.push(`${paint('red', '✗')} ${paint('dim', `install failed — run ${install.command}`)}`)
    if (install.error) lines.push(`   ${paint('dim', install.error)}`)
  }

  for (const action of result.written) {
    const verb = result.dryRun
      ? (action.kind === 'create' ? 'would create' : 'would update')
      : (action.kind === 'create' ? 'created' : 'updated')
    const glyph = result.dryRun ? paint('yellow', '·') : paint('green', '✓')
    lines.push(`${glyph} ${paint('dim', verb)} ${action.relative}`)
  }

  for (const note of result.already) {
    lines.push(`${paint('dim', `· ${note}`)}`)
  }

  if (result.manual.length > 0) {
    lines.push('')
    lines.push(paint('dim', 'YOUR TURN'))
    for (const step of result.manual) {
      lines.push(`${paint('yellow', '→')} ${paint('bold', step.title)} ${paint('dim', `· ${step.file}`)}`)
      lines.push(`   ${paint('dim', step.reason)}`)
      for (const line of step.snippet.split('\n')) {
        lines.push(`   ${paint('cyan', line)}`)
      }
      lines.push('')
    }
  } else {
    lines.push('')
  }

  lines.push(gradientRule(ctx, HEADER_GRADIENT_WIDTH))
  if (result.dryRun) {
    lines.push(paint('dim', 'dry run — nothing was written. Drop --dry-run to apply.'))
  } else {
    lines.push(`${paint('dim', 'next:')} ${paint('bold', 'evlog doctor')} ${paint('dim', 'to verify ·')} ${paint('bold', 'evlog map')} ${paint('dim', 'to score what is still dark')}`)
  }
  lines.push(`${paint('dim', 'setup guide →')} ${docLink(ctx, FRAMEWORK_DOCS[result.framework] ?? '/start/installation')}`)

  return lines.join('\n')
}
