import { describe, expect, it } from 'vitest'
import { parseAgentId, providerLabel } from '../app/utils/telemetry-icons'

describe('parseAgentId', () => {
  it('splits a versioned agent slug into its three parts', () => {
    expect(parseAgentId('claude-code_2-1-220_agent')).toEqual({
      name: 'Claude Code',
      version: '2.1.220',
      variant: 'agent',
    })
  })

  it('reads a bare agent name', () => {
    expect(parseAgentId('cursor')).toEqual({ name: 'Cursor', version: undefined, variant: undefined })
  })

  it('keeps a variant with no version', () => {
    expect(parseAgentId('claude-code_harness')).toEqual({
      name: 'Claude Code',
      version: undefined,
      variant: 'harness',
    })
  })

  it('title-cases an agent it has never heard of', () => {
    expect(parseAgentId('some-new-agent').name).toBe('Some New Agent')
  })
})

describe('providerLabel', () => {
  it('spells known providers the way they spell themselves', () => {
    expect(providerLabel('github_actions')).toBe('GitHub Actions')
    expect(providerLabel('circleci')).toBe('CircleCI')
    expect(providerLabel('gitlab')).toBe('GitLab')
  })

  it('names the unidentified-CI bucket rather than leaving it blank', () => {
    expect(providerLabel('unknown')).toBe('Unknown CI')
  })

  it('title-cases an unrecognised provider instead of leaving it a slug', () => {
    expect(providerLabel('some_new_ci')).toBe('Some New Ci')
  })
})
