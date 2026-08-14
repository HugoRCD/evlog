import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './mdc.mjs'
import { measure } from './metrics.mjs'
import { modelChecks } from './model-checks.mjs'

const page = (surface, source, external = false) => ({
  path: 'a.md',
  surface,
  external,
  metrics: measure(parseMarkdown(source)),
})

const ids = checks => checks.map(check => check.id)

describe('modelChecks', () => {
  it('asks the same three of every surface', () => {
    expect(ids(modelChecks(page('docs', 'The drain batches.')))).toEqual(expect.arrayContaining(['U-04', 'U-06', 'D-01']))
    expect(ids(modelChecks(page('skill', 'Run the scanner.')))).toEqual(expect.arrayContaining(['U-04', 'U-06', 'D-01']))
  })

  it('asks a skill what only a skill owes', () => {
    const checks = ids(modelChecks(page('skill', 'Run the scanner.')))

    expect(checks).toContain('M-06')
    expect(checks).toContain('M-04')
    expect(ids(modelChecks(page('docs', 'Run the scanner.')))).not.toContain('M-06')
  })

  it('only asks about code where there is code', () => {
    const withCode = page('docs', 'Wire it.\n\n```ts\nimport { createLogger } from \'evlog\'\n```')

    expect(ids(modelChecks(withCode))).toContain('U-10')
    expect(ids(modelChecks(page('docs', 'Wire it.')))).not.toContain('U-10')
  })

  it('raises the dossier whenever another logger is named, claim or not', () => {
    const mention = page('docs', 'Teams arriving from pino keep the same field names.')

    expect(ids(modelChecks(mention))).toContain('U-12')
  })

  it('inverts the dossier question on a page we did not write', () => {
    const ours = modelChecks(page('reference', 'Unlike pino, the drain batches.')).find(check => check.id === 'U-12')
    const theirs = modelChecks(page('reference', 'Unlike pino, the drain batches.', true)).find(check => check.id === 'U-12')

    expect(ours.ask).toContain('check every claim against it')
    expect(theirs.ask).toContain('dossier line to correct')
  })
})
