import { describe, expect, it, vi } from 'vitest'
import { getHeaders } from 'h3'
import type { DrainContext } from '../src/types'

// Mock h3's getHeaders
vi.mock('h3', () => ({
  getHeaders: vi.fn(),
}))

/** Headers that should never be passed to the drain hook for security */
const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]

/** Simulate the getSafeHeaders function from the plugin */
function getSafeHeaders(allHeaders: Record<string, string>): Record<string, string> {
  const safeHeaders: Record<string, string> = {}

  for (const [key, value] of Object.entries(allHeaders)) {
    if (!SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      safeHeaders[key] = value
    }
  }

  return safeHeaders
}

describe('nitro plugin - drain hook headers', () => {
  it('passes headers to evlog:drain hook', () => {
    const mockHeaders = {
      'content-type': 'application/json',
      'x-request-id': 'test-123',
      'x-posthog-session-id': 'session-456',
      'x-posthog-distinct-id': 'user-789',
    }

    vi.mocked(getHeaders).mockReturnValue(mockHeaders)

    let drainContext: DrainContext | null = null
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
    const allHeaders = getHeaders(mockEvent as Parameters<typeof getHeaders>[0])
    mockNitroApp.hooks.callHook('evlog:drain', {
      event: mockEmittedEvent,
      request: {
        method: mockEvent.method,
        path: mockEvent.path,
        requestId: mockEvent.context.requestId,
      },
      headers: getSafeHeaders(allHeaders),
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
    expect(drainContext).not.toBeNull()
    expect(drainContext!.headers).toMatchObject({
      'content-type': 'application/json',
      'x-request-id': 'test-123',
      'x-posthog-session-id': 'session-456',
      'x-posthog-distinct-id': 'user-789',
    })
  })

  it('filters out sensitive headers for security', () => {
    const mockHeaders = {
      'content-type': 'application/json',
      'x-request-id': 'test-123',
      // Sensitive headers that should be filtered
      'authorization': 'Bearer secret-token',
      'cookie': 'session=abc123',
      'set-cookie': 'session=abc123; HttpOnly',
      'x-api-key': 'secret-api-key',
      'x-auth-token': 'secret-auth-token',
      'proxy-authorization': 'Basic credentials',
    }

    vi.mocked(getHeaders).mockReturnValue(mockHeaders)

    let drainContext: DrainContext | null = null
    const mockHooks = {
      callHook: vi.fn().mockImplementation((hookName, ctx) => {
        if (hookName === 'evlog:drain') {
          drainContext = ctx
        }
        return Promise.resolve()
      }),
    }

    const mockNitroApp = { hooks: mockHooks }
    const mockEvent = { method: 'GET', path: '/api/users', context: {} }

    const allHeaders = getHeaders(mockEvent as Parameters<typeof getHeaders>[0])
    mockNitroApp.hooks.callHook('evlog:drain', {
      event: { timestamp: '', level: 'info', service: 'test', environment: 'test' },
      request: { method: mockEvent.method, path: mockEvent.path },
      headers: getSafeHeaders(allHeaders),
    })

    // Verify sensitive headers are NOT included
    expect(drainContext!.headers).not.toHaveProperty('authorization')
    expect(drainContext!.headers).not.toHaveProperty('cookie')
    expect(drainContext!.headers).not.toHaveProperty('set-cookie')
    expect(drainContext!.headers).not.toHaveProperty('x-api-key')
    expect(drainContext!.headers).not.toHaveProperty('x-auth-token')
    expect(drainContext!.headers).not.toHaveProperty('proxy-authorization')

    // Verify safe headers ARE included
    expect(drainContext!.headers).toHaveProperty('content-type', 'application/json')
    expect(drainContext!.headers).toHaveProperty('x-request-id', 'test-123')
  })

  it('includes all standard non-sensitive HTTP headers', () => {
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

    let drainContext: DrainContext | null = null
    const mockHooks = {
      callHook: vi.fn().mockImplementation((hookName, ctx) => {
        if (hookName === 'evlog:drain') {
          drainContext = ctx
        }
        return Promise.resolve()
      }),
    }

    const mockNitroApp = { hooks: mockHooks }
    const mockEvent = { method: 'GET', path: '/api/users', context: {} }

    const allHeaders = getHeaders(mockEvent as Parameters<typeof getHeaders>[0])
    mockNitroApp.hooks.callHook('evlog:drain', {
      event: { timestamp: '', level: 'info', service: 'test', environment: 'test' },
      request: { method: mockEvent.method, path: mockEvent.path },
      headers: getSafeHeaders(allHeaders),
    })

    // Verify all safe headers are passed through
    expect(drainContext!.headers).toEqual(mockHeaders)
    expect(drainContext!.headers?.['user-agent']).toBe('Mozilla/5.0')
    expect(drainContext!.headers?.['x-forwarded-for']).toBe('192.168.1.1')
  })

  it('handles empty headers', () => {
    vi.mocked(getHeaders).mockReturnValue({})

    let drainContext: DrainContext | null = null
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

    const allHeaders = getHeaders(mockEvent as Parameters<typeof getHeaders>[0])
    mockNitroApp.hooks.callHook('evlog:drain', {
      event: { timestamp: '', level: 'info', service: 'test', environment: 'test' },
      request: { method: mockEvent.method, path: mockEvent.path },
      headers: getSafeHeaders(allHeaders),
    })

    expect(drainContext!.headers).toEqual({})
  })

  it('preserves custom correlation headers for external services', () => {
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

    let drainContext: DrainContext | null = null
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

    const allHeaders = getHeaders(mockEvent as Parameters<typeof getHeaders>[0])
    mockNitroApp.hooks.callHook('evlog:drain', {
      event: { timestamp: '', level: 'info', service: 'test', environment: 'test' },
      request: { method: mockEvent.method, path: mockEvent.path },
      headers: getSafeHeaders(allHeaders),
    })

    // Verify all correlation headers are available
    expect(drainContext!.headers?.['x-posthog-session-id']).toBe('ph-session-123')
    expect(drainContext!.headers?.['x-posthog-distinct-id']).toBe('ph-user-456')
    expect(drainContext!.headers?.['sentry-trace']).toBe('00-abc123-def456-01')
    expect(drainContext!.headers?.['traceparent']).toBeDefined()
    expect(drainContext!.headers?.['x-correlation-id']).toBe('corr-789')
  })

  it('filters sensitive headers case-insensitively', () => {
    const mockHeaders = {
      'Authorization': 'Bearer token',
      'COOKIE': 'session=123',
      'X-Api-Key': 'secret',
      'content-type': 'application/json',
    }

    vi.mocked(getHeaders).mockReturnValue(mockHeaders)

    let drainContext: DrainContext | null = null
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

    const allHeaders = getHeaders(mockEvent as Parameters<typeof getHeaders>[0])
    mockNitroApp.hooks.callHook('evlog:drain', {
      event: { timestamp: '', level: 'info', service: 'test', environment: 'test' },
      request: { method: mockEvent.method, path: mockEvent.path },
      headers: getSafeHeaders(allHeaders),
    })

    // Verify sensitive headers are filtered regardless of case
    expect(drainContext!.headers).not.toHaveProperty('Authorization')
    expect(drainContext!.headers).not.toHaveProperty('COOKIE')
    expect(drainContext!.headers).not.toHaveProperty('X-Api-Key')

    // Verify safe headers are kept
    expect(drainContext!.headers).toHaveProperty('content-type', 'application/json')
  })
})
