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
    expect(gatewayRouting().zeroDataRetention).toBe(true)
  })

  it('sorts an interactive surface on time to first token', async () => {
    const { gatewayRouting } = await loadGateway({})
    expect(gatewayRouting('channel:photon').sort).toBe('ttft')
    expect(gatewayRouting('http').sort).toBe('ttft')
    expect(gatewayRouting().sort).toBe('ttft')
  })

  it('leaves scheduled runs on the cheapest deployment', async () => {
    const { gatewayRouting } = await loadGateway({})
    expect(gatewayRouting('schedule').sort).toBe('cost')
  })

  it('pins scheduled runs to the vetted provider order, keeping the pool as fallback', async () => {
    const { gatewayRouting } = await loadGateway({})
    expect(gatewayRouting('schedule').order).toEqual(['fireworks', 'alibaba'])
  })

  it('leaves interactive surfaces without a provider pin', async () => {
    const { gatewayRouting } = await loadGateway({})
    expect(gatewayRouting('channel:photon')).not.toHaveProperty('order')
    expect(gatewayRouting()).not.toHaveProperty('order')
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

describe('defaultReportTags', () => {
  it('parses the env list and falls back to the attribution tag when it is empty or blank', async () => {
    const { defaultReportTags } = await loadGateway({ AI_GATEWAY_REPORT_TAGS: ' evi:env:production , evi:surface:github ' })
    expect(defaultReportTags()).toEqual(['evi:env:production', 'evi:surface:github'])
    const blank = await loadGateway({ AI_GATEWAY_REPORT_TAGS: ' , ', VERCEL_ENV: 'production' })
    expect(blank.defaultReportTags()).toEqual(['evi:env:production'])
  })
})

describe('reportQuery', () => {
  it('scopes by key name when one is configured and no grouping was requested', async () => {
    const { reportQuery } = await loadGateway({ AI_GATEWAY_REPORT_API_KEY_NAME: 'evi-key' })
    expect(reportQuery({})).toEqual({
      groupBy: 'api_key_name',
      tags: undefined,
      tagsMatch: undefined,
      keyName: 'evi-key',
    })
  })

  it('lets an explicit groupBy win and falls back to tag scoping', async () => {
    const { reportQuery } = await loadGateway({ AI_GATEWAY_REPORT_API_KEY_NAME: 'evi-key', VERCEL_ENV: 'production' })
    expect(reportQuery({ groupBy: 'tag' })).toEqual({
      groupBy: 'tag',
      tags: ['evi:env:production'],
      tagsMatch: 'all',
      keyName: undefined,
    })
  })

  it('defaults to model grouping over the default tags when no key name is configured', async () => {
    const { reportQuery } = await loadGateway({ VERCEL_ENV: 'production' })
    expect(reportQuery({ tags: ['evi:surface:github'], tagsMatch: 'any' })).toEqual({
      groupBy: 'model',
      tags: ['evi:surface:github'],
      tagsMatch: 'any',
      keyName: undefined,
    })
  })
})

describe('scopedReport', () => {
  const payload = {
    results: [
      { api_key_name: 'EVI-KEY', cost: 1 },
      { api_key_name: 'other', cost: 2 },
    ],
  }

  it('filters key-name scoped rows case-insensitively and stamps the scope receipt', async () => {
    const { reportQuery, scopedReport } = await loadGateway({ AI_GATEWAY_REPORT_API_KEY_NAME: 'evi-key' })
    const report = scopedReport(payload, reportQuery({}))
    expect(report.results).toEqual([{ api_key_name: 'EVI-KEY', cost: 1 }])
    expect(report.scope).toMatchObject({ mode: 'api_key_name', apiKeyName: 'evi-key', matchedRows: 1 })
  })

  it('passes tag-scoped rows through, warning against account-wide fallbacks', async () => {
    const { reportQuery, scopedReport } = await loadGateway({})
    const report = scopedReport(payload, reportQuery({ groupBy: 'tag' }))
    expect(report.results).toHaveLength(2)
    expect(report.scope).toMatchObject({ mode: 'tags', groupBy: 'tag', matchedRows: 2 })
    expect(report.scope.note).toContain('Do not fall back to account-wide totals')
  })

  it('reports zero matches rather than widening to the account', async () => {
    const { reportQuery, scopedReport } = await loadGateway({ AI_GATEWAY_REPORT_API_KEY_NAME: 'missing' })
    const report = scopedReport({ results: [] }, reportQuery({}))
    expect(report.results).toEqual([])
    expect(report.scope.note).toContain('Do not quote account-wide totals')
  })
})
