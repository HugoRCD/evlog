import { beforeEach, describe, expect, it, vi } from 'vitest'

async function loadIdentity(env: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return await import('./identity')
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('parsePrincipal', () => {
  it('splits a principal into its surface and id', async () => {
    const { parsePrincipal } = await loadIdentity({})
    expect(parsePrincipal('github:4271224')).toEqual({ surface: 'github', externalId: '4271224' })
    expect(parsePrincipal('imessage:+33600000000'))
      .toEqual({ surface: 'imessage', externalId: '+33600000000' })
  })

  it('splits on the first colon only, so an id may contain one', async () => {
    const { parsePrincipal } = await loadIdentity({})
    expect(parsePrincipal('mcp:hugo:laptop'))
      .toEqual({ surface: 'mcp', externalId: 'hugo:laptop' })
  })

  it('refuses an unknown surface rather than inventing one', async () => {
    const { parsePrincipal } = await loadIdentity({})
    // A wrong identity row is a join key that merges two people.
    expect(parsePrincipal('slack:U123')).toBeNull()
  })

  it.each([
    ['no separator', 'github'],
    ['an empty id', 'github:'],
    ['an empty surface', ':4271224'],
    ['nothing at all', undefined],
  ])('refuses %s', async (_label, principal) => {
    const { parsePrincipal } = await loadIdentity({})
    expect(parsePrincipal(principal)).toBeNull()
  })
})

describe('surfaceOf', () => {
  it('maps the photon channel to imessage, matching the seeded principals', async () => {
    const { surfaceOf } = await loadIdentity({})
    // `trust.ts` mints `imessage:<phone>`; recording `photon` would not line up.
    expect(surfaceOf('photon')).toBe('imessage')
  })

  it('passes the channels that already share their surface name', async () => {
    const { surfaceOf } = await loadIdentity({})
    expect(surfaceOf('github')).toBe('github')
    expect(surfaceOf('linear')).toBe('linear')
    expect(surfaceOf('mcp')).toBe('mcp')
  })

  it('falls back to local for the framework channels', async () => {
    const { surfaceOf } = await loadIdentity({})
    expect(surfaceOf('http')).toBe('local')
    expect(surfaceOf('schedule')).toBe('local')
  })
})

describe('maintainerIdentities', () => {
  it('turns every configured principal into an identity row', async () => {
    const { maintainerIdentities } = await loadIdentity({
      MAINTAINER_GITHUB_ID: '4271224',
      MAINTAINER_LINEAR_ID: 'lin-1',
      MAINTAINER_PHONE: '+33600000000',
      EVI_MCP_TOKEN: 'token',
    })
    expect(maintainerIdentities()).toEqual(expect.arrayContaining([
      { surface: 'github', externalId: '4271224' },
      { surface: 'linear', externalId: 'lin-1' },
      { surface: 'imessage', externalId: '+33600000000' },
      { surface: 'mcp', externalId: 'hugo' },
    ]))
  })

  it('omits a channel with no configured principal', async () => {
    const { maintainerIdentities } = await loadIdentity({ MAINTAINER_GITHUB_ID: '4271224' })
    expect(maintainerIdentities()).toEqual([{ surface: 'github', externalId: '4271224' }])
  })

  it('is empty when nothing is configured, so no person is seeded', async () => {
    const { maintainerIdentities } = await loadIdentity({})
    expect(maintainerIdentities()).toEqual([])
  })
})
