import { gradientRule, HEADER_GRADIENT_WIDTH } from '../../core/brand'
import type { CliContext } from '../../core/context'
import { DOCS_URL, createStyle } from '../../core/output'
import type { AgentsResult } from './run'

/**
 * What `evlog agents` did, for a run that asked nothing.
 *
 * Same contract as the `init` report: every outcome gets a line, including the
 * ones where nothing changed, so "already up to date" is never confusable with
 * "did not look".
 */
export function formatAgentsReport(ctx: CliContext, result: AgentsResult): string {
  const { paint } = createStyle(ctx)
  const lines: string[] = []

  if (result.cancelled) {
    return paint('yellow', 'Cancelled — nothing was written.')
  }

  lines.push(paint('bold', result.framework ?? 'no framework detected'))
  lines.push('')

  for (const action of result.written) {
    const verb = result.dryRun
      ? (action.kind === 'create' ? 'would create' : 'would update')
      : (action.kind === 'create' ? 'created' : 'updated')
    const glyph = result.dryRun ? paint('yellow', '·') : paint('green', '✓')
    lines.push(`${glyph} ${paint('dim', verb)} ${action.relative}`)
  }

  for (const note of result.already) {
    lines.push(paint('dim', `· ${note}`))
  }

  /* A command to type is a label plus the command, never a sentence with the
     command inside it — inline, the reader never registers there is one. */
  const { skills } = result
  if (skills.status === 'already') {
    lines.push(`${paint('green', '✓')} ${paint('dim', `skills already installed · ${skills.dirs.join(', ')}`)}`)
    /* The skills CLI owns their lifecycle, so the refresh command is theirs. */
    lines.push(`  ${paint('dim', 'refresh')}  ${paint('bold', 'npx skills update')}`)
  } else if (skills.status === 'installed') {
    lines.push(`${paint('green', '✓')} ${paint('dim', 'installed the evlog skills')}`)
  } else if (skills.status === 'skipped') {
    lines.push(`${paint('yellow', '·')} ${paint('dim', 'skills not installed')}`)
    lines.push(`  ${paint('dim', 'install')}  ${paint('bold', skills.command)}`)
  } else {
    lines.push(`${paint('red', '✗')} ${paint('dim', 'skills not installed')}`)
    if (skills.error) lines.push(`   ${paint('dim', skills.error)}`)
    lines.push(`  ${paint('dim', 'retry  ')}  ${paint('bold', skills.command)}`)
  }

  lines.push('')
  lines.push(gradientRule(ctx, HEADER_GRADIENT_WIDTH))
  if (result.dryRun) {
    lines.push(paint('dim', 'dry run — nothing was written. Drop --dry-run to apply.'))
  } else {
    lines.push(`${paint('dim', 'next:')} ${paint('bold', 'evlog map')} ${paint('dim', 'to score what is still dark')}`)
  }
  lines.push(`${paint('dim', 'agent skills →')} ${paint('dim', `${DOCS_URL}/reference/agent-skills`)}`)

  return lines.join('\n')
}
