import { describe, expect, it } from 'vitest'
import { parseMarkdown } from './mdc.mjs'
import { measure } from './metrics.mjs'
import { corpusChecks, modelChecks } from './model-checks.mjs'

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

describe('the agent audience', () => {
  it('is asked of a docs page carrying code, and of nothing else', () => {
    const withCode = 'Wire it up:\n\n```ts\nimport { evlog } from \'evlog/hono\'\n```'

    expect(ids(modelChecks(page('docs', withCode)))).toContain('M-05')
    expect(ids(modelChecks(page('docs', 'Prose with no sample in it.')))).not.toContain('M-05')
    expect(ids(modelChecks(page('landing', withCode)))).not.toContain('M-05')
  })

  it('asks about the next step only where the page points somewhere', () => {
    expect(ids(modelChecks(page('docs', 'See [sampling](/learn/sampling).')))).toContain('D-08')
    expect(ids(modelChecks(page('docs', 'A page that points nowhere.')))).not.toContain('D-08')
  })
})

describe('corpusChecks', () => {
  it('asks what no single page can answer', () => {
    const corpus = [{ path: 'a.md', surface: 'docs' }, { path: 'b.md', surface: 'reference' }]

    expect(ids(corpusChecks(corpus))).toEqual(['U-15', 'D-01'])
    expect(corpusChecks(corpus)[0].ask).toContain('2 pages')
  })

  it('stays quiet when there is nothing to compare', () => {
    expect(corpusChecks([{ path: 'a.md', surface: 'docs' }])).toEqual([])
  })
})
