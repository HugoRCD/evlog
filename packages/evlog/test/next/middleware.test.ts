import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defined } from '../helpers/defined'
import { evlogMiddleware } from '../../src/next/middleware'

type MockNextRequest = {
  nextUrl: { pathname: string }
  headers: { get(name: string): string | null }
}

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

function createMockRequest(pathname: string, headers: Record<string, string> = {}): MockNextRequest {
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
    const response = await middleware(request)

    expect(response.headers.get('x-request-id')).toBeDefined()
    expect(typeof response.headers.get('x-request-id')).toBe('string')
  })

  it('reuses existing x-request-id from request', async () => {
    const middleware = evlogMiddleware()
    const request = createMockRequest('/api/test', { 'x-request-id': 'existing-id' })
    const response = await middleware(request)

    expect(response.headers.get('x-request-id')).toBe('existing-id')
  })

  it('passes request headers via NextResponse.next()', async () => {
    const middleware = evlogMiddleware()
    const request = createMockRequest('/api/test')
    await middleware(request)

    expect(mockNextResponse.next).toHaveBeenCalled()
    const callArgs = defined(mockNextResponse.next.mock.calls[0]?.[0], 'NextResponse.next args')
    const requestHeaders = defined(callArgs.request, 'next request').headers
    expect(requestHeaders).toBeInstanceOf(Headers)
    expect(requestHeaders.get('x-request-id')).toBeDefined()
    expect(requestHeaders.get('x-evlog-start')).toBeDefined()
  })

  it('sets x-evlog-start header with timestamp', async () => {
    const middleware = evlogMiddleware()
    const request = createMockRequest('/api/test')
    await middleware(request)

    const callArgs = defined(mockNextResponse.next.mock.calls[0]?.[0], 'NextResponse.next args')
    const startTime = Number(defined(callArgs.request, 'next request').headers.get('x-evlog-start'))
    expect(startTime).toBeGreaterThan(0)
    expect(startTime).toBeLessThanOrEqual(Date.now())
  })

  it('skips excluded routes', async () => {
    const middleware = evlogMiddleware({ exclude: ['/_next/**'] })
    const request = createMockRequest('/_next/static/chunk.js')
    await middleware(request)

    expect(mockNextResponse.next).toHaveBeenCalled()
    const [excludedCallArgs] = mockNextResponse.next.mock.calls
    expect(excludedCallArgs[0]).toBeUndefined()
  })

  it('respects include patterns', async () => {
    const middleware = evlogMiddleware({ include: ['/api/**'] })

    const apiRequest = createMockRequest('/api/test')
    await middleware(apiRequest)
    expect(mockNextResponse.next).toHaveBeenCalledTimes(1)
    const apiCallArgs = defined(mockNextResponse.next.mock.calls[0]?.[0], 'api NextResponse.next args')
    expect(defined(apiCallArgs.request, 'api next request').headers.get('x-request-id')).toBeDefined()

    vi.clearAllMocks()

    const pageRequest = createMockRequest('/about')
    await middleware(pageRequest)
    expect(mockNextResponse.next).toHaveBeenCalledTimes(1)
    const [pageCallArgs] = mockNextResponse.next.mock.calls
    expect(pageCallArgs[0]).toBeUndefined()
  })
})
