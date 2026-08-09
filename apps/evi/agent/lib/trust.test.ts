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

async function loadTrust(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, '')
    else vi.stubEnv(key, value)
  }
  return await import('./trust')
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('isMaintainer', () => {
  it('matches the configured principals per channel', async () => {
    const trust = await loadTrust({
      MAINTAINER_GITHUB_ID: '12345',
      MAINTAINER_LINEAR_ID: 'abc-def',
      MAINTAINER_PHONE: '+33600000000',
    })
    expect(trust.isMaintainer(auth({ principalId: 'github:12345' }))).toBe(true)
    expect(trust.isMaintainer(auth({ principalId: 'linear:abc-def' }))).toBe(true)
    expect(trust.isMaintainer(auth({ principalId: 'imessage:+33600000000' }))).toBe(true)
    expect(trust.isMaintainer(auth({ principalId: 'github:99999' }))).toBe(false)
    expect(trust.isMaintainer(null)).toBe(false)
  })

  it('drops a channel whose env variable is missing', async () => {
    const trust = await loadTrust({
      MAINTAINER_GITHUB_ID: '12345',
      MAINTAINER_LINEAR_ID: undefined,
      MAINTAINER_PHONE: undefined,
    })
    expect(trust.isMaintainer(auth({ principalId: 'github:12345' }))).toBe(true)
    expect(trust.isMaintainer(auth({ principalId: 'linear:abc-def' }))).toBe(false)
    expect(trust.isMaintainer(auth({ principalId: 'imessage:+33600000000' }))).toBe(false)
  })
})

describe('isAutonomous', () => {
  it('matches only the constructed first-responder principal', async () => {
    const trust = await loadTrust({})
    expect(trust.isAutonomous(auth({ principalId: trust.AUTONOMOUS_GITHUB_PRINCIPAL }))).toBe(true)
    expect(trust.isAutonomous(auth({ principalId: 'github:12345' }))).toBe(false)
    expect(trust.isAutonomous(null)).toBe(false)
  })
})

describe('canAccessAdminTools', () => {
  it('allows the maintainer and schedule app principals, nobody else', async () => {
    const trust = await loadTrust({ MAINTAINER_GITHUB_ID: '12345' })
    expect(trust.canAccessAdminTools(auth({ principalId: 'github:12345' }))).toBe(true)
    expect(
      trust.canAccessAdminTools(
        auth({ authenticator: 'app', principalId: 'eve:app', principalType: 'runtime' }),
      ),
    ).toBe(true)
    expect(trust.canAccessAdminTools(auth({ principalId: 'github:67890' }))).toBe(false)
    expect(
      trust.canAccessAdminTools(auth({ principalId: 'eve:app', principalType: 'runtime' })),
    ).toBe(false)
    expect(trust.canAccessAdminTools(null)).toBe(false)
  })
})
