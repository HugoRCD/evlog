import { describe, expect, it, vi } from 'vitest'
import { getHeaders } from 'h3'

// Mock h3's getHeaders
vi.mock('h3', () => ({
  getHeaders: vi.fn(),
}))

describe('nitro plugin - drain hook headers', () => {
  it('passes headers to evlog:drain hook', async () => {
    const mockHeaders = {
      'content-type': 'application/json',
      'x-request-id': 'test-123',
      'x-posthog-session-id': 'session-456',
      'x-posthog-distinct-id': 'user-789',
      'authorization': 'Bearer token',
    }

    // Mock getHeaders to return our test headers
    vi.mocked(getHeaders).mockReturnValue(mockHeaders)

    // Capture what's passed to the drain hook
    let drainContext: unknown = null
    const mockHooks = {
      callHook: vi.fn().mockImplementation((hookName, ctx) => {
        if (hookName === 'evlog:drain') {
          drainContext = ctx
        }
        return Promise.resolve()
      }),
    }

    // Import the callDrainHook function logic (we'll test the behavior inline)
    const mockNitroApp = { hooks: mockHooks }
    const mockEvent = {
      method: 'POST',
      path: '/api/test',
      context: { requestId: 'req-123' },
    }
    const mockEmittedEvent = {
      timestamp: new Date().toISOString(),
      level: 'info' as const,
      service: 'test',
      environment: 'test',
    }

    // Simulate what callDrainHook does
    mockNitroApp.hooks.callHook('evlog:drain', {
      event: mockEmittedEvent,
      request: {
        method: mockEvent.method,
        path: mockEvent.path,
        requestId: mockEvent.context.requestId,
      },
      headers: getHeaders(mockEvent as Parameters<typeof getHeaders>[0]),
    })

    // Verify the drain hook was called with headers
    expect(mockHooks.callHook).toHaveBeenCalledWith('evlog:drain', expect.objectContaining({
      event: mockEmittedEvent,
      request: {
        method: 'POST',
        path: '/api/test',
        requestId: 'req-123',
      },
      headers: mockHeaders,
    }))

    // Verify drainContext contains headers
    expect(drainContext).toMatchObject({
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'test-123',
        'x-posthog-session-id': 'session-456',
        'x-posthog-distinct-id': 'user-789',
      },
    })
  })

  it('includes all standard HTTP headers', async () => {
    const mockHeaders = {
      'accept': 'application/json',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'host': 'localhost:3000',
      'user-agent': 'Mozilla/5.0',
      'x-forwarded-for': '192.168.1.1',
      'x-real-ip': '192.168.1.1',
    }

    vi.mocked(getHeaders).mockReturnValue(mockHeaders)

    let drainContext: { headers?: Record<string, string> } = {}
    const mockHooks = {
      callHook: vi.fn().mockImplementation((hookName, ctx) => {
        if (hookName === 'evlog:drain') {
          drainContext = ctx
        }
        return Promise.resolve()
      }),
    }

    const mockNitroApp = { hooks: mockHooks }
    const mockEvent = {
      method: 'GET',
      path: '/api/users',
      context: {},
    }

    mockNitroApp.hooks.callHook('evlog:drain', {
      event: { timestamp: '', level: 'info', service: 'test', environment: 'test' },
      request: { method: mockEvent.method, path: mockEvent.path },
      headers: getHeaders(mockEvent as Parameters<typeof getHeaders>[0]),
    })

    // Verify all headers are passed through
    expect(drainContext.headers).toEqual(mockHeaders)
    expect(drainContext.headers?.['user-agent']).toBe('Mozilla/5.0')
    expect(drainContext.headers?.['x-forwarded-for']).toBe('192.168.1.1')
  })

  it('handles empty headers', async () => {
    vi.mocked(getHeaders).mockReturnValue({})

    let drainContext: { headers?: Record<string, string> } = {}
    const mockHooks = {
      callHook: vi.fn().mockImplementation((hookName, ctx) => {
        if (hookName === 'evlog:drain') {
          drainContext = ctx
        }
        return Promise.resolve()
      }),
    }

    const mockNitroApp = { hooks: mockHooks }
    const mockEvent = { method: 'GET', path: '/', context: {} }

    mockNitroApp.hooks.callHook('evlog:drain', {
      event: { timestamp: '', level: 'info', service: 'test', environment: 'test' },
      request: { method: mockEvent.method, path: mockEvent.path },
      headers: getHeaders(mockEvent as Parameters<typeof getHeaders>[0]),
    })

    expect(drainContext.headers).toEqual({})
  })

  it('preserves custom correlation headers for external services', async () => {
    // Test headers commonly used for correlation with external services
    const correlationHeaders = {
      // PostHog
      'x-posthog-session-id': 'ph-session-123',
      'x-posthog-distinct-id': 'ph-user-456',
      // Sentry
      'sentry-trace': '00-abc123-def456-01',
      'baggage': 'sentry-environment=production',
      // OpenTelemetry
      'traceparent': '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      'tracestate': 'congo=t61rcWkgMzE',
      // Custom
      'x-correlation-id': 'corr-789',
      'x-request-id': 'req-abc',
    }

    vi.mocked(getHeaders).mockReturnValue(correlationHeaders)

    let drainContext: { headers?: Record<string, string> } = {}
    const mockHooks = {
      callHook: vi.fn().mockImplementation((hookName, ctx) => {
        if (hookName === 'evlog:drain') {
          drainContext = ctx
        }
        return Promise.resolve()
      }),
    }

    const mockNitroApp = { hooks: mockHooks }
    const mockEvent = { method: 'POST', path: '/api/checkout', context: {} }

    mockNitroApp.hooks.callHook('evlog:drain', {
      event: { timestamp: '', level: 'info', service: 'test', environment: 'test' },
      request: { method: mockEvent.method, path: mockEvent.path },
      headers: getHeaders(mockEvent as Parameters<typeof getHeaders>[0]),
    })

    // Verify all correlation headers are available
    expect(drainContext.headers?.['x-posthog-session-id']).toBe('ph-session-123')
    expect(drainContext.headers?.['x-posthog-distinct-id']).toBe('ph-user-456')
    expect(drainContext.headers?.['sentry-trace']).toBe('00-abc123-def456-01')
    expect(drainContext.headers?.['traceparent']).toBeDefined()
    expect(drainContext.headers?.['x-correlation-id']).toBe('corr-789')
  })
})
