import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyFixes, isSafeFix, loadRedirects } from './fix.mjs'

const fix = (source, redirects) => applyFixes(source, { redirects: new Map(Object.entries(redirects ?? {})) })

describe('T-15 retired entry points', () => {
  it('renames the import inside a fence', () => {
    const { source, applied } = fix('```ts\nimport { createLogger } from \'evlog/shared\'\n```')

    expect(source).toContain('evlog/toolkit')
    expect(applied).toEqual([expect.objectContaining({ id: 'T-15', line: 2 })])
  })

  it('renames a symbol in backticks', () => {
    expect(fix('Pull the helper from `evlog/browser` in your entry.').source)
      .toBe('Pull the helper from `evlog/http` in your entry.')
  })

  it('leaves the page that documents the deprecation alone', () => {
    const source = 'The `evlog/browser` path is deprecated and re-exports `evlog/http`.'

    expect(fix(source).source).toBe(source)
  })
})

describe('U-15 terminology', () => {
  it('renames a term with one replacement, keeping its case', () => {
    expect(fix('Register the sink. Sinks receive every event.').source)
      .toBe('Register the drain. Drains receive every event.')
  })

  it('leaves a sentence that is describing another tool', () => {
    const source = 'pino writes through a transport, and its sink runs in a worker.'

    expect(fix(source).source).toBe(source)
  })

  it('leaves a term in backticks, because a symbol is not prose', () => {
    expect(fix('The `sink` option takes a sink.').source).toBe('The `sink` option takes a drain.')
  })
})

describe('U-14 dashes', () => {
  it('leaves every dash to someone who can read the sentence', () => {
    // A dashed span is sometimes an appositive and sometimes a list. Commas fix
    // the first and wreck the second, and the second was the majority here.
    const appositive = 'The drain batches — then retries with backoff — before it gives up.'
    const list = 'It finds every entry point — handlers, pages, middleware — and scores each one.'
    const single = 'evlog is built for the day-zero choice — pick it once.'

    for (const source of [appositive, list, single]) expect(fix(source).source).toBe(source)
  })
})

describe('U-16 links', () => {
  it('follows a redirect to the page that exists now', () => {
    const { source, applied } = fix('See [the guide](/logging/overview) for more.', { '/logging/overview': '/learn/overview' })

    expect(source).toBe('See [the guide](/learn/overview) for more.')
    expect(applied[0].id).toBe('U-16')
  })

  it('keeps the fragment', () => {
    expect(fix('See [it](/logging#drains).', { '/logging': '/learn/overview' }).source)
      .toBe('See [it](/learn/overview#drains).')
  })

  it('leaves a link with no redirect behind it', () => {
    const source = 'See [it](/nowhere).'

    expect(fix(source).source).toBe(source)
  })
})

describe('what it never touches', () => {
  it('leaves frontmatter alone', () => {
    const source = '---\ntitle: The sink\n---\n\nRegister the sink.'

    expect(fix(source).source).toBe('---\ntitle: The sink\n---\n\nRegister the drain.')
  })

  it('leaves prose words inside a fence alone', () => {
    const source = '```bash\n# write to a sink\nevlog tail\n```'

    expect(fix(source).source).toBe(source)
  })

  it('reports nothing when there is nothing to do', () => {
    expect(fix('The drain batches events, then retries.').applied).toEqual([])
  })
})

describe('isSafeFix', () => {
  const rated = (score, ids) => ({ score, findings: ids.map(id => ({ id })) })

  it('accepts a fix that cleared something', () => {
    expect(isSafeFix(rated(85, ['U-14', 'U-15']), rated(90, ['U-14']))).toEqual({ safe: true })
  })

  it('accepts a partial fix that left the page-level finding standing', () => {
    // Four dashes, one of them paired: the count drops, the finding does not.
    expect(isSafeFix(rated(90, ['U-14']), rated(90, ['U-14']))).toEqual({ safe: true })
  })

  it('rejects a fix that traded one finding for another', () => {
    const verdict = isSafeFix(rated(90, ['U-14']), rated(90, ['T-03']))

    expect(verdict).toMatchObject({ safe: false })
    expect(verdict.why).toContain('T-03')
  })

  it('rejects a fix that lowered the score', () => {
    expect(isSafeFix(rated(90, ['U-14']), rated(85, []))).toMatchObject({ safe: false })
  })
})

describe('loadRedirects', () => {
  it('reads the docs redirect table', () => {
    const map = loadRedirects(join(import.meta.dirname, '../../../apps/docs/config/redirects.ts'))

    expect(map.get('/logging')).toBe('/learn/overview')
  })

  it('returns an empty map rather than throwing on a missing file', () => {
    expect(loadRedirects('/nowhere/redirects.ts').size).toBe(0)
  })
})
