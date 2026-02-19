import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evlogMiddleware } from '../../src/next/middleware'

// Mock next/server
const mockNextResponse = {
  next: vi.fn((options?: { request?: { headers: Headers } }) => {
    const headers = new Map<string, string>()
    return {
      headers: {
        set: (key: string, value: string) => headers.set(key, value),
        get: (key: string) => headers.get(key),
      },
    }
  }),
}

vi.mock('next/server', () => ({
  NextResponse: mockNextResponse,
}))

function createMockRequest(pathname: string, headers: Record<string, string> = {}) {
  return {
    nextUrl: { pathname },
    headers: {
      get: (name: string) => headers[name] ?? null,
    },
  }
}

describe('evlogMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a middleware function', () => {
    const middleware = evlogMiddleware()
    expect(typeof middleware).toBe('function')
  })

  it('sets x-request-id header on response', async () => {
    const middleware = evlogMiddleware()
    const request = createMockRequest('/api/test')
    const response = await middleware(request as any)

    expect(response.headers.get('x-request-id')).toBeDefined()
    expect(typeof response.headers.get('x-request-id')).toBe('string')
  })

  it('reuses existing x-request-id from request', async () => {
    const middleware = evlogMiddleware()
    const request = createMockRequest('/api/test', { 'x-request-id': 'existing-id' })
    const response = await middleware(request as any)

    expect(response.headers.get('x-request-id')).toBe('existing-id')
  })

  it('passes request headers via NextResponse.next()', async () => {
    const middleware = evlogMiddleware()
    const request = createMockRequest('/api/test')
    await middleware(request as any)

    expect(mockNextResponse.next).toHaveBeenCalled()
    const callArgs = mockNextResponse.next.mock.calls[0][0]
    expect(callArgs.request.headers).toBeInstanceOf(Headers)

    const headers = callArgs.request.headers
    expect(headers.get('x-request-id')).toBeDefined()
    expect(headers.get('x-evlog-start')).toBeDefined()
  })

  it('sets x-evlog-start header with timestamp', async () => {
    const middleware = evlogMiddleware()
    const request = createMockRequest('/api/test')
    await middleware(request as any)

    const callArgs = mockNextResponse.next.mock.calls[0][0]
    const startTime = Number(callArgs.request.headers.get('x-evlog-start'))
    expect(startTime).toBeGreaterThan(0)
    expect(startTime).toBeLessThanOrEqual(Date.now())
  })

  it('skips excluded routes', async () => {
    const middleware = evlogMiddleware({ exclude: ['/_next/**'] })
    const request = createMockRequest('/_next/static/chunk.js')
    await middleware(request as any)

    // Should call NextResponse.next() without custom headers
    expect(mockNextResponse.next).toHaveBeenCalled()
    const callArgs = mockNextResponse.next.mock.calls[0]
    // For excluded routes, no request headers are passed
    expect(callArgs[0]).toBeUndefined()
  })

  it('respects include patterns', async () => {
    const middleware = evlogMiddleware({ include: ['/api/**'] })

    // Matching route - should add headers
    const apiRequest = createMockRequest('/api/test')
    await middleware(apiRequest as any)
    expect(mockNextResponse.next).toHaveBeenCalledTimes(1)
    const apiCallArgs = mockNextResponse.next.mock.calls[0][0]
    expect(apiCallArgs.request.headers.get('x-request-id')).toBeDefined()

    vi.clearAllMocks()

    // Non-matching route - should skip
    const pageRequest = createMockRequest('/about')
    await middleware(pageRequest as any)
    expect(mockNextResponse.next).toHaveBeenCalledTimes(1)
    const pageCallArgs = mockNextResponse.next.mock.calls[0]
    expect(pageCallArgs[0]).toBeUndefined()
  })
})
