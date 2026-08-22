# Test Template

Complete test template for `packages/evlog/test/adapters/{name}.test.ts`, following `packages/evlog/test/README.md` conventions. `loki.test.ts` and `clickhouse.test.ts` are the most recent reference implementations.

Replace `{Name}`, `{name}`, `{NAME}` with the actual service name.

Rules from the test README that apply here:

- Use `mockFetch()` + `getFetchCall` / `getFetchJson` / `getFetchHeaders` from `../helpers/fetch`, don't hand-roll fetch spies in adapter tests (a few older files still do; follow the helpers, not them).
- Delete every env var the adapter reads in `afterEach`. Leaked env vars make later tests order-dependent.
- Test exported pure helpers (`to{Name}Event`, `build{Name}Payload`, URL resolvers) in their own `describe` blocks, but only the ones the adapter actually exports. If the adapter has no converter (service accepts arbitrary JSON), drop the `to{Name}Event` import and its `describe` block entirely.
- No `!` non-null assertions, use `defined()` from `../helpers/defined` if narrowing is needed.
- Register the adapter in `encode-parity.test.ts` so the drain and `sendBatchTo{Name}` are pinned to the same encoder (not every existing adapter is registered there yet; new ones should be).

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'
import { getFetchCall, getFetchHeaders, getFetchJson, mockFetch } from '../helpers/fetch'
import {
  create{Name}Drain,
  sendBatchTo{Name},
  sendTo{Name},
  to{Name}Event,
} from '../../src/adapters/{name}'

function createTestEvent(overrides?: Partial<WideEvent>): WideEvent {
  return {
    timestamp: '2024-01-01T12:00:00.000Z',
    level: 'info',
    service: 'api',
    environment: 'production',
    ...overrides,
  }
}

describe('{name} adapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = mockFetch(new Response(null, { status: 200 }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.NUXT_{NAME}_API_KEY
    delete process.env.NUXT_{NAME}_ENDPOINT
    delete process.env.{NAME}_API_KEY
    delete process.env.{NAME}_ENDPOINT
  })

  // --- 1. Pure helpers ---------------------------------------------------
  describe('to{Name}Event', () => {
    it('maps a wide event to the service shape', () => {
      const event = createTestEvent({ path: '/api/users' })
      expect(to{Name}Event(event)).toEqual({
        timestamp: '2024-01-01T12:00:00.000Z',
        level: 'info',
        data: { service: 'api', environment: 'production', path: '/api/users' },
      })
    })
  })

  // --- 2. Direct send: URL, headers, body ---------------------------------
  describe('sendTo{Name}', () => {
    it('sends to the default endpoint', async () => {
      await sendTo{Name}(createTestEvent(), { apiKey: 'test-key' })

      const { url } = getFetchCall(fetchSpy)
      expect(url).toBe('https://api.{name}.com/v1/ingest')
    })

    it('uses a custom endpoint and tolerates trailing slashes', async () => {
      await sendTo{Name}(createTestEvent(), {
        apiKey: 'test-key',
        endpoint: 'https://custom.{name}.com/',
      })

      const { url } = getFetchCall(fetchSpy)
      expect(url).toBe('https://custom.{name}.com/v1/ingest')
    })

    it('sets auth and content-type headers', async () => {
      await sendTo{Name}(createTestEvent(), { apiKey: 'my-secret-key' })

      const headers = getFetchHeaders(fetchSpy)
      expect(headers.Authorization).toBe('Bearer my-secret-key')
      expect(headers['Content-Type']).toBe('application/json')
    })

    it('sends the event in the service format', async () => {
      await sendTo{Name}(createTestEvent({ action: 'test-action' }), { apiKey: 'test-key' })

      const body = getFetchJson(fetchSpy)
      // Adapt to the service's expected payload structure
      expect(body).toBeInstanceOf(Array)
      expect(body).toHaveLength(1)
    })
  })

  // --- 3. Batch operations -------------------------------------------------
  describe('sendBatchTo{Name}', () => {
    it('sends multiple events in one request', async () => {
      const events = [
        createTestEvent({ requestId: '1' }),
        createTestEvent({ requestId: '2' }),
        createTestEvent({ requestId: '3' }),
      ]

      await sendBatchTo{Name}(events, { apiKey: 'test-key' })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(getFetchJson(fetchSpy)).toHaveLength(3)
    })

    it('skips fetch when the batch is empty', async () => {
      await sendBatchTo{Name}([], { apiKey: 'test-key' })
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  // --- 4. Drain factory: config resolution + skip behavior ------------------
  describe('create{Name}Drain', () => {
    it('resolves config from env vars', async () => {
      process.env.{NAME}_API_KEY = 'env-key'
      const drain = create{Name}Drain()

      await drain({ event: createTestEvent() })

      const headers = getFetchHeaders(fetchSpy)
      expect(headers.Authorization).toBe('Bearer env-key')
    })

    // "Skips" means: no request, no throw. The adapter still console.errors the
    // missing key (suppressed by the beforeEach spy) so misconfiguration is visible.
    it('skips the request when apiKey is missing', async () => {
      const drain = create{Name}Drain()

      await drain({ event: createTestEvent() })

      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('accepts an array of drain contexts', async () => {
      const drain = create{Name}Drain({ apiKey: 'test-key' })

      await drain([
        { event: createTestEvent({ requestId: '1' }) },
        { event: createTestEvent({ requestId: '2' }) },
      ])

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(getFetchJson(fetchSpy)).toHaveLength(2)
    })
  })
})
```

## Customization Notes

- **URL assertions**: Update expected URLs to the actual service API, including the path-already-present case if the encoder tolerates it (see `resolveLokiPushUrl`).
- **Auth headers**: Match the service (`X-API-Key`, HTTP Basic, `X-ClickHouse-User`, …).
- **Body format**: Wrapper objects (PostHog `{ api_key, batch }`), raw arrays (Axiom), NDJSON (ClickHouse). Assert the real structure, not just "is an array".
- **Deprecated aliases**: If the adapter supports one (`token` → `apiKey`), add a test that the alias still resolves and that the canonical name wins when both are set.
- **Error swallowing**: The drain itself never throws; its `raw` variant rejects and single-attempts so the pipeline can own retries. Both contracts live in `defineHttpDrain` and are covered by `test/toolkit/toolkit.test.ts`; don't re-test them per adapter. Only direct helpers surface errors.
- **Service-specific helpers**: Every exported helper (`buildLokiPayload`, `toClickHouseRow`, severity mappers…) gets its own `describe` with edge cases (empty input, malformed timestamps, cardinality guards).

## Beyond unit tests

- **Encode parity**: add the adapter to `test/adapters/encode-parity.test.ts`.
- **E2E**: create `test/e2e/{name}.e2e.ts` gated on the adapter's env vars; extend `test/e2e/docker-compose.yml` + `seed.mjs` when the service is self-hostable.
