import { describe, expect, it } from 'vitest'
import { checkDrift } from './drift.mjs'
import { parseMarkdown } from './mdc.mjs'

const api = {
  symbols: new Set(['useLogger', 'createAxiomDrain', 'defineErrorCatalog', 'readFsLogs', 'EvlogVariables']),
  entries: new Set(['evlog', 'evlog/toolkit', 'evlog/axiom', 'evlog/fs', 'evlog/hono']),
}
const routes = new Set(['/', '/learn/sampling', '/extend/drain-pipeline'])

const check = source => checkDrift(parseMarkdown(source), api, routes)

describe('import checks', () => {
  it('flags an entry point that is not exported', () => {
    const findings = check("```ts\nimport { createAxiomDrain } from 'evlog/adapters/axiom'\n```")

    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('critical')
    expect(findings[0].message).toContain('evlog/adapters/axiom')
  })

  it('reports a bad specifier once, not twice', () => {
    const findings = check("```ts\nimport { createAxiomDrain } from 'evlog/adapters/axiom'\n```")

    expect(findings.filter(finding => finding.message.includes('evlog/adapters/axiom'))).toHaveLength(1)
  })

  it('flags a named import the package does not export', () => {
    const findings = check("```ts\nimport { createHoneycombDrain } from 'evlog'\n```")

    expect(findings[0].message).toContain('createHoneycombDrain')
  })

  it('accepts a type-only named import', () => {
    expect(check("```ts\nimport { useLogger, type EvlogVariables } from 'evlog/hono'\n```")
      .filter(finding => finding.message.includes('EvlogVariables'))).toHaveLength(0)
  })

  it('accepts a generator export', () => {
    expect(check("```ts\nimport { readFsLogs } from 'evlog/fs'\n```")).toEqual([])
  })
})

describe('prose symbols', () => {
  it('flags a symbol one rename away from a real export', () => {
    const findings = check('Call `useLoggr` at the top of the handler.')

    expect(findings[0].severity).toBe('standard')
    expect(findings[0].message).toContain('useLogger')
  })

  it('ignores a third-party symbol that resembles nothing exported', () => {
    expect(check('Wrap the handler with `withSentryConfig` from the Sentry SDK.')).toEqual([])
  })
})

describe('links', () => {
  it('flags an internal link with no page behind it', () => {
    const findings = check('See [Pipeline](/learn/pipeline) for batching.')

    expect(findings[0].id).toBe('U-16')
    expect(findings[0].severity).toBe('critical')
  })

  it('accepts an anchor on a known route', () => {
    expect(check('See [Sampling](/learn/sampling#tail) for the rescue rules.')).toEqual([])
  })

  it('leaves external links alone', () => {
    expect(check('See [Loki](https://grafana.com/oss/loki/).')).toEqual([])
  })
})
