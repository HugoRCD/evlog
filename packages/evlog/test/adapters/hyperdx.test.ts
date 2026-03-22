import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'
import {
  HYPERDX_DEFAULT_OTLP_HTTP_ENDPOINT,
  sendBatchToHyperDX,
  sendToHyperDX,
  toHyperDXOTLPConfig,
} from '../../src/adapters/hyperdx'

describe('hyperdx adapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const createTestEvent = (overrides?: Partial<WideEvent>): WideEvent => ({
    timestamp: '2024-01-01T12:00:00.000Z',
    level: 'info',
    service: 'test-service',
    environment: 'test',
    ...overrides,
  })

  describe('toHyperDXOTLPConfig', () => {
    it('defaults endpoint to HyperDX cloud OTLP HTTP URL from docs', () => {
      const otlp = toHyperDXOTLPConfig({
        apiKey: 'hdx-test-key',
      })
      expect(otlp.endpoint).toBe(HYPERDX_DEFAULT_OTLP_HTTP_ENDPOINT)
      expect(otlp.endpoint).toBe('https://in-otel.hyperdx.io')
    })

    it('sets authorization header to the API key per HyperDX OpenTelemetry docs', () => {
      const otlp = toHyperDXOTLPConfig({
        apiKey: 'my-ingestion-key',
      })
      expect(otlp.headers).toEqual({
        authorization: 'my-ingestion-key',
      })
    })
  })

  describe('sendToHyperDX', () => {
    it('POSTs OTLP JSON to default cloud endpoint /v1/logs', async () => {
      const event = createTestEvent()

      await sendToHyperDX(event, {
        apiKey: 'k',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://in-otel.hyperdx.io/v1/logs')
    })

    it('uses custom OTLP HTTP base URL when endpoint is overridden', async () => {
      const event = createTestEvent()

      await sendToHyperDX(event, {
        apiKey: 'k',
        endpoint: 'https://otel.my-company.internal',
      })

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://otel.my-company.internal/v1/logs')
    })

    it('sends authorization header with API key', async () => {
      const event = createTestEvent()

      await sendToHyperDX(event, {
        apiKey: 'secret-hdx-key',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        authorization: 'secret-hdx-key',
        'Content-Type': 'application/json',
      }))
    })

    it('sends valid OTLP resourceLogs payload', async () => {
      const event = createTestEvent()

      await sendToHyperDX(event, {
        apiKey: 'k',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const payload = JSON.parse(options.body as string)
      expect(payload).toHaveProperty('resourceLogs')
      expect(payload.resourceLogs[0].scopeLogs[0].scope.name).toBe('evlog')
    })
  })

  describe('sendBatchToHyperDX', () => {
    it('no-ops on empty batch', async () => {
      await sendBatchToHyperDX([], { apiKey: 'k' })
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
