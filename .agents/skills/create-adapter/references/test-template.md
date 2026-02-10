# Test Template

Complete test template for `packages/evlog/test/adapters/{name}.test.ts`.

Replace `{Name}`, `{name}` with the actual service name.

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WideEvent } from '../../src/types'
import { sendBatchTo{Name}, sendTo{Name} } from '../../src/adapters/{name}'

describe('{name} adapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  // --- Setup: mock globalThis.fetch to return 200 ---
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // --- Test event factory ---
  const createTestEvent = (overrides?: Partial<WideEvent>): WideEvent => ({
    timestamp: '2024-01-01T12:00:00.000Z',
    level: 'info',
    service: 'test-service',
    environment: 'test',
    ...overrides,
  })

  // --- 1. URL Construction ---
  describe('sendTo{Name}', () => {
    it('sends event to correct URL', async () => {
      const event = createTestEvent()

      await sendTo{Name}(event, {
        apiKey: 'test-key',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      // Verify the default endpoint URL
      expect(url).toBe('https://api.{name}.com/v1/ingest')
    })

    it('uses custom endpoint when provided', async () => {
      const event = createTestEvent()

      await sendTo{Name}(event, {
        apiKey: 'test-key',
        endpoint: 'https://custom.{name}.com',
      })

      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://custom.{name}.com/v1/ingest')
    })

    // --- 2. Headers ---
    it('sets correct Authorization header', async () => {
      const event = createTestEvent()

      await sendTo{Name}(event, {
        apiKey: 'my-secret-key',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        'Authorization': 'Bearer my-secret-key',
      }))
    })

    it('sets Content-Type to application/json', async () => {
      const event = createTestEvent()

      await sendTo{Name}(event, {
        apiKey: 'test-key',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      expect(options.headers).toEqual(expect.objectContaining({
        'Content-Type': 'application/json',
      }))
    })

    // Add service-specific header tests here
    // Example: orgId, project header, region header, etc.

    // --- 3. Request Body ---
    it('sends event in correct format', async () => {
      const event = createTestEvent({ action: 'test-action', userId: '123' })

      await sendTo{Name}(event, {
        apiKey: 'test-key',
      })

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      // Verify the body matches the expected format
      // Adapt this to match the service's expected payload structure
      expect(body).toBeInstanceOf(Array)
      expect(body).toHaveLength(1)
    })

    // --- 4. Error Handling ---
    it('throws error on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('Bad Request', { status: 400, statusText: 'Bad Request' }),
      )

      const event = createTestEvent()

      await expect(sendTo{Name}(event, {
        apiKey: 'test-key',
      })).rejects.toThrow('{Name} API error: 400 Bad Request')
    })
  })

  // --- 5. Batch Operations ---
  describe('sendBatchTo{Name}', () => {
    it('sends multiple events in a single request', async () => {
      const events = [
        createTestEvent({ requestId: '1' }),
        createTestEvent({ requestId: '2' }),
        createTestEvent({ requestId: '3' }),
      ]

      await sendBatchTo{Name}(events, {
        apiKey: 'test-key',
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(options.body as string)
      expect(body).toHaveLength(3)
    })

    it('skips fetch when events array is empty', async () => {
      await sendBatchTo{Name}([], {
        apiKey: 'test-key',
      })

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  // --- 6. Timeout Handling ---
  describe('timeout handling', () => {
    it('uses default timeout of 5000ms', async () => {
      const event = createTestEvent()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      await sendTo{Name}(event, {
        apiKey: 'test-key',
      })

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000)
    })

    it('uses custom timeout when provided', async () => {
      const event = createTestEvent()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

      await sendTo{Name}(event, {
        apiKey: 'test-key',
        timeout: 10000,
      })

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10000)
    })
  })
})
```

## Customization Notes

- **URL assertions**: Update the expected URLs to match the actual service API.
- **Auth headers**: If the service uses a custom auth header (e.g., `X-API-Key` instead of `Authorization: Bearer`), update the header assertions.
- **Body format**: Adapt body assertions to match the service's expected payload. Some services wrap events in an object (PostHog: `{ api_key, batch }`), others accept raw arrays (Axiom).
- **Empty batch**: The template asserts `fetchSpy` is NOT called for empty arrays. If your adapter sends empty arrays (like Axiom does), change this to match.
- **Event transformation**: If you export a `to{Name}Event()` converter, add dedicated tests for it (see `otlp.test.ts` for `toOTLPLogRecord` tests as a reference).
- **Service-specific tests**: Add tests for any service-specific features (e.g., Axiom's `orgId` header, OTLP's severity mapping, PostHog's `distinct_id`).
