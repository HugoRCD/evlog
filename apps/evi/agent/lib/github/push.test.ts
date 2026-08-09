import { describe, expect, it } from 'vitest'
import { mintInstallationToken, pushBrokerPolicy, validatePushBranch } from './push'

describe('validatePushBranch', () => {
  it('accepts ordinary feature branch names', () => {
    expect(validatePushBranch('fix/pipeline-flush')).toBeNull()
    expect(validatePushBranch('feat/adapter.loki-v2')).toBeNull()
    expect(validatePushBranch('chore_1')).toBeNull()
  })

  it('refuses protected branches', () => {
    expect(validatePushBranch('main')).toMatch(/not allowed/)
    expect(validatePushBranch('master')).toMatch(/not allowed/)
  })

  it('refuses names that could escape the command line or the ref namespace', () => {
    expect(validatePushBranch('fix; rm -rf /')).toMatch(/not a valid branch name/)
    expect(validatePushBranch("fix'`x")).toMatch(/not a valid branch name/)
    expect(validatePushBranch('-leading-dash')).toMatch(/not a valid branch name/)
    expect(validatePushBranch('a..b')).toMatch(/not a valid branch name/)
    expect(validatePushBranch('a//b')).toMatch(/not a valid branch name/)
    expect(validatePushBranch('trailing/')).toMatch(/not a valid branch name/)
    expect(validatePushBranch('')).toMatch(/not a valid branch name/)
  })
})

describe('pushBrokerPolicy', () => {
  it('brokers a basic x-access-token header for github.com only', () => {
    const policy = pushBrokerPolicy('tok_123')
    expect(policy).toEqual({
      allow: {
        'github.com': [
          {
            transform: [
              {
                headers: {
                  Authorization: `Basic ${Buffer.from('x-access-token:tok_123').toString('base64')}`,
                },
              },
            ],
          },
        ],
        '*': [],
      },
    })
  })
})

describe('mintInstallationToken', () => {
  it('returns a static token as-is and resolves a lazy one', async () => {
    await expect(mintInstallationToken({ installationToken: 'tok' })).resolves.toBe('tok')
    await expect(mintInstallationToken({ installationToken: async () => 'lazy' })).resolves.toBe('lazy')
  })

  it('throws when the connector exposes no token', async () => {
    await expect(mintInstallationToken({})).rejects.toThrow('no installation token')
  })
})
