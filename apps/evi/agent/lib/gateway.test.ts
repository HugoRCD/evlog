import { beforeEach, describe, expect, it, vi } from 'vitest'

async function loadGateway(env: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return await import('./gateway')
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('gatewayRouting', () => {
  it('routes with zero data retention enabled', async () => {
    const { gatewayRouting } = await loadGateway({})
    expect(gatewayRouting.zeroDataRetention).toBe(true)
  })
})

describe('sessionTags', () => {
  it('tags one dimension per tag: environment and surface', async () => {
    const { sessionTags } = await loadGateway({ VERCEL_ENV: 'production' })
    expect(sessionTags('channel:github')).toEqual(['evi:env:production', 'evi:surface:github'])
  })

  it('labels eval runs from EVE_RUN_MODE ahead of VERCEL_ENV', async () => {
    const { sessionTags } = await loadGateway({ EVE_RUN_MODE: 'eval', VERCEL_ENV: 'production' })
    expect(sessionTags('http')).toEqual(['evi:env:eval', 'evi:surface:http'])
  })

  it('falls back to local environment and unknown surface', async () => {
    const { sessionTags } = await loadGateway({})
    expect(sessionTags()).toEqual(['evi:env:local', 'evi:surface:unknown'])
  })
})
