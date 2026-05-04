import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrainContext, WideEvent } from 'evlog'
import { createAcmeDrain, toAcmeEvent } from '../src/index'

const baseEvent = (): WideEvent => ({
  timestamp: '2030-01-01T00:00:00.000Z',
  level: 'info',
  service: 'shop',
  environment: 'test',
  action: 'checkout',
})

const ctx = (event: WideEvent): DrainContext => ({ event } as DrainContext)

describe('toAcmeEvent', () => {
  it('flattens timestamp + level + attributes', () => {
    expect(toAcmeEvent(baseEvent())).toEqual({
      ts: new Date('2030-01-01T00:00:00.000Z').getTime(),
      level: 'info',
      attributes: { service: 'shop', environment: 'test', action: 'checkout' },
    })
  })
})

describe('createAcmeDrain', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))))
    vi.stubEnv('ACME_API_KEY', 'env-secret')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('skips silently when apiKey is missing', async () => {
    vi.stubEnv('ACME_API_KEY', '')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const drain = createAcmeDrain()
    await drain(ctx(baseEvent()))
    expect(fetch).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[evlog/acme]'))
  })

  it('POSTs the encoded payload to the resolved endpoint', async () => {
    const drain = createAcmeDrain({ endpoint: 'https://acme.test' })
    await drain(ctx(baseEvent()))
    expect(fetch).toHaveBeenCalledWith(
      'https://acme.test/v1/ingest',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer env-secret',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"action":"checkout"'),
      }),
    )
  })

  it('honors explicit overrides over env vars', async () => {
    const drain = createAcmeDrain({ apiKey: 'override-secret' })
    await drain(ctx(baseEvent()))
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit]
    const headers = call[1].headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer override-secret')
  })
})
