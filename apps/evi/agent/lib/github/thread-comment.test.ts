import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionAuthContext } from 'eve/context'

function auth(overrides: Partial<SessionAuthContext>): SessionAuthContext {
  return {
    attributes: {},
    authenticator: 'test',
    principalId: 'test:none',
    principalType: 'user',
    ...overrides,
  }
}

function githubAuth(overrides: Partial<SessionAuthContext> = {}): SessionAuthContext {
  return auth({
    authenticator: 'github-webhook',
    principalId: 'github:12345',
    attributes: { issue_number: '654', pull_request_number: '', ...overrides.attributes },
    ...overrides,
  })
}

async function load(env: Record<string, string | undefined> = {}) {
  vi.resetModules()
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('EVE_RUN_MODE', undefined)
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, '')
    else vi.stubEnv(key, value)
  }
  return await import('./thread-comment')
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('threadCommentPolicy', () => {
  it('denies commenting on the current GitHub thread, even for the maintainer', async () => {
    const { threadCommentPolicy } = await load({ MAINTAINER_GITHUB_ID: '12345' })
    const current = githubAuth()
    expect(threadCommentPolicy(current, { issueNumber: 654, body: 'hello' })).toEqual({
      type: 'denied',
      reason: expect.stringContaining('already posts your reply'),
    })
    expect(threadCommentPolicy(current, { body: 'hello' })).toEqual({
      type: 'denied',
      reason: expect.stringContaining('already posts your reply'),
    })
  })

  it('denies when the GitHub session has no thread number to compare', async () => {
    const { threadCommentPolicy } = await load({ MAINTAINER_GITHUB_ID: '12345' })
    expect(threadCommentPolicy(
      githubAuth({ attributes: { issue_number: '', pull_request_number: '' } }),
      { issueNumber: 1, body: 'hello' },
    )).toEqual({
      type: 'denied',
      reason: expect.stringContaining('already posts your reply'),
    })
  })

  it('allows a comment on a different issue, still gated by writePolicy', async () => {
    const { threadCommentPolicy } = await load({ MAINTAINER_GITHUB_ID: '12345' })
    expect(threadCommentPolicy(
      githubAuth(),
      { issueNumber: 660, body: 'pointer' },
    )).toBe('not-applicable')
    expect(threadCommentPolicy(
      githubAuth({ principalId: 'github:99999' }),
      { issueNumber: 660, body: 'pointer' },
    )).toBe('user-approval')
  })

  it('does not treat a Slack session as a GitHub thread', async () => {
    const { threadCommentPolicy } = await load({ MAINTAINER_GITHUB_ID: '12345' })
    expect(threadCommentPolicy(
      auth({
        authenticator: 'slack-webhook',
        principalId: 'github:12345',
        attributes: { issue_number: '654' },
      }),
      { issueNumber: 654, body: 'from slack' },
    )).toBe('not-applicable')
  })

  it('matches snake_case and pull-request numbers on the same thread', async () => {
    const { threadCommentPolicy } = await load({ MAINTAINER_GITHUB_ID: '12345' })
    expect(threadCommentPolicy(
      githubAuth({ attributes: { issue_number: '660', pull_request_number: '660' } }),
      { pull_request_number: 660, body: 'on the pr' },
    )).toEqual({
      type: 'denied',
      reason: expect.stringContaining('already posts your reply'),
    })
  })
})
