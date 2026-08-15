import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionAuthContext } from 'eve/context'

async function loadScope(env: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return await import('./scope')
}

function auth(principalId: string, overrides: Partial<SessionAuthContext> = {}): SessionAuthContext {
  return {
    attributes: {},
    authenticator: 'github',
    principalId,
    principalType: 'user',
    ...overrides,
  } as SessionAuthContext
}

const MAINTAINER = { MAINTAINER_GITHUB_ID: '4271224', VERCEL_ENV: 'production' }
const HUGO = auth('github:4271224')
const SCHEDULE = auth('eve:app', { authenticator: 'app', principalType: 'runtime' })
const AUTONOMOUS = auth('github:evlogai')
const STRANGER = auth('github:999999')

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('tenantOf', () => {
  it('places the maintainer and schedules in the home tenant', async () => {
    const { tenantOf, HOME_TENANT } = await loadScope(MAINTAINER)
    expect(tenantOf(HUGO)).toBe(HOME_TENANT)
    expect(tenantOf(SCHEDULE)).toBe(HOME_TENANT)
  })

  it('gives an autonomous turn no tenant', async () => {
    const { tenantOf } = await loadScope(MAINTAINER)
    expect(tenantOf(AUTONOMOUS)).toBeNull()
  })

  it('gives an unrecognized caller no tenant', async () => {
    const { tenantOf } = await loadScope(MAINTAINER)
    expect(tenantOf(STRANGER)).toBeNull()
    expect(tenantOf(null)).toBeNull()
  })
})

describe('readableTargets', () => {
  it('reads the agent realm and the calleres own person realm', async () => {
    const { readableTargets, HOME_TENANT, SINGLETON } = await loadScope(MAINTAINER)
    expect(readableTargets(HUGO, 'person-1')).toEqual([
      { tenantId: HOME_TENANT, realm: 'agent', realmKey: SINGLETON },
      { tenantId: HOME_TENANT, realm: 'person', realmKey: 'person-1' },
    ])
  })

  it('drops the person realm when no person resolved', async () => {
    const { readableTargets } = await loadScope(MAINTAINER)
    expect(readableTargets(HUGO, null)).toHaveLength(1)
  })

  it('reads nothing on an autonomous turn, person or not', async () => {
    const { readableTargets } = await loadScope(MAINTAINER)
    expect(readableTargets(AUTONOMOUS, 'person-1')).toEqual([])
  })

  it('reads nothing for a caller outside the tenant', async () => {
    const { readableTargets } = await loadScope(MAINTAINER)
    expect(readableTargets(STRANGER, 'person-1')).toEqual([])
  })

  it('never returns a target outside the home tenant', async () => {
    const { readableTargets, HOME_TENANT } = await loadScope(MAINTAINER)
    for (const caller of [HUGO, SCHEDULE, AUTONOMOUS, STRANGER, null]) {
      for (const target of readableTargets(caller, 'person-1')) {
        expect(target.tenantId).toBe(HOME_TENANT)
      }
    }
  })
})

describe('writableTarget', () => {
  it('lets the maintainer write both realms', async () => {
    const { writableTarget, HOME_TENANT, SINGLETON } = await loadScope(MAINTAINER)
    expect(writableTarget(HUGO, 'agent', 'person-1'))
      .toEqual({ tenantId: HOME_TENANT, realm: 'agent', realmKey: SINGLETON })
    expect(writableTarget(HUGO, 'person', 'person-1'))
      .toEqual({ tenantId: HOME_TENANT, realm: 'person', realmKey: 'person-1' })
  })

  it('refuses a person write with no person', async () => {
    const { writableTarget } = await loadScope(MAINTAINER)
    expect(writableTarget(HUGO, 'person', null)).toBeNull()
  })

  it('refuses every caller who is not the maintainer', async () => {
    const { writableTarget } = await loadScope(MAINTAINER)
    for (const caller of [SCHEDULE, AUTONOMOUS, STRANGER, null]) {
      expect(writableTarget(caller, 'agent', 'person-1')).toBeNull()
      expect(writableTarget(caller, 'person', 'person-1')).toBeNull()
    }
  })
})
