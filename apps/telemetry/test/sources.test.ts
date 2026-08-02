import { describe, expect, it } from 'vitest'
import { classifySource, parseSourceToken, sourceToken } from '../shared/utils/sources'

/** A local, interactive, human run — every case below varies one field off this. */
const LOCAL = { ci: false, provider: null, agent: null, tty: true }

describe('classifySource', () => {
  it('reads a plain interactive run as a terminal', () => {
    expect(classifySource(LOCAL)).toEqual({ kind: 'terminal', id: 'terminal' })
  })

  it('reads a non-interactive local run as automation', () => {
    expect(classifySource({ ...LOCAL, tty: false })).toEqual({ kind: 'automation', id: 'automation' })
  })

  it('names the agent when one drove the run', () => {
    expect(classifySource({ ...LOCAL, agent: 'claude-code' })).toEqual({ kind: 'agent', id: 'claude-code' })
  })

  it('names the CI provider', () => {
    expect(classifySource({ ci: true, provider: 'github_actions', agent: null, tty: false }))
      .toEqual({ kind: 'ci', id: 'github_actions' })
  })

  it('counts an agent running inside CI as CI', () => {
    // Where it ran outranks what drove it — otherwise every pipeline using an
    // agent would be missing from the CI column.
    expect(classifySource({ ci: true, provider: 'github_actions', agent: 'claude-code', tty: false }))
      .toEqual({ kind: 'ci', id: 'github_actions' })
  })

  it('keeps CI runs whose provider is unknown in the CI kind', () => {
    expect(classifySource({ ci: true, provider: null, agent: null, tty: false }))
      .toEqual({ kind: 'ci', id: 'unknown' })
  })

  it('ignores tty once a source has been identified', () => {
    expect(classifySource({ ...LOCAL, agent: 'cursor', tty: false }).kind).toBe('agent')
    expect(classifySource({ ci: true, provider: 'vercel', agent: null, tty: true }).kind).toBe('ci')
  })
})

describe('sourceToken', () => {
  it('qualifies provider and agent ids with their kind', () => {
    expect(sourceToken({ kind: 'ci', id: 'github_actions' })).toBe('ci:github_actions')
    expect(sourceToken({ kind: 'agent', id: 'claude-code' })).toBe('agent:claude-code')
  })

  it('leaves the two local kinds unqualified', () => {
    expect(sourceToken({ kind: 'terminal', id: 'terminal' })).toBe('terminal')
    expect(sourceToken({ kind: 'automation', id: 'automation' })).toBe('automation')
  })

  it('round-trips every kind', () => {
    const sources = [
      { kind: 'ci', id: 'github_actions' },
      { kind: 'agent', id: 'claude-code' },
      { kind: 'terminal', id: 'terminal' },
      { kind: 'automation', id: 'automation' },
    ] as const

    for (const source of sources) {
      expect(parseSourceToken(sourceToken(source))).toEqual(source)
    }
  })

  it('keeps an id that itself contains a colon intact', () => {
    expect(parseSourceToken('agent:vendor:tool')).toEqual({ kind: 'agent', id: 'vendor:tool' })
  })
})

describe('parseSourceToken', () => {
  it('rejects anything malformed, so a hand-edited URL just drops the filter', () => {
    expect(parseSourceToken('')).toBeUndefined()
    expect(parseSourceToken('nonsense')).toBeUndefined()
    expect(parseSourceToken('ci')).toBeUndefined()
    expect(parseSourceToken('ci:')).toBeUndefined()
    expect(parseSourceToken(':github_actions')).toBeUndefined()
    expect(parseSourceToken('unknown-kind:x')).toBeUndefined()
  })
})
