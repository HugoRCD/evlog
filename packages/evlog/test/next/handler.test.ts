import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWithEvlog } from '../../src/next/handler'
import { evlogStorage } from '../../src/next/storage'
import { initLogger } from '../../src/logger'

// Mock next/server to prevent import errors
vi.mock('next/server', () => ({
  after: undefined,
}))

describe('withEvlog', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('wraps a handler and provides a logger via AsyncLocalStorage', async () => {
    const withEvlog = createWithEvlog({ pretty: false })
    let loggerAvailable = false

    const handler = withEvlog((request: Request) => {
      const store = evlogStorage.getStore()
      loggerAvailable = store !== undefined
      return new Response('ok')
    })

    const request = new Request('http://localhost/api/test', { method: 'POST' })
    await handler(request)

    expect(loggerAvailable).toBe(true)
  })

  it('captures request method and path from Request object', async () => {
    const drainMock = vi.fn()
    const withEvlog = createWithEvlog({ pretty: false, drain: drainMock })

    const handler = withEvlog((_request: Request) => {
      return new Response('ok')
    })

    const request = new Request('http://localhost/api/checkout', { method: 'POST' })
    await handler(request)

    expect(consoleSpy).toHaveBeenCalled()
    const [[output]] = consoleSpy.mock.calls
    const parsed = JSON.parse(output)
    expect(parsed.method).toBe('POST')
    expect(parsed.path).toBe('/api/checkout')
    expect(parsed.status).toBe(200)
  })

  it('captures response status from Response object', async () => {
    const withEvlog = createWithEvlog({ pretty: false })

    const handler = withEvlog(() => {
      return new Response('created', { status: 201 })
    })

    const request = new Request('http://localhost/api/items', { method: 'POST' })
    await handler(request)

    expect(consoleSpy).toHaveBeenCalled()
    const [[output]] = consoleSpy.mock.calls
    const parsed = JSON.parse(output)
    expect(parsed.status).toBe(201)
  })

  it('allows setting context via the logger', async () => {
    const withEvlog = createWithEvlog({ pretty: false })

    const handler = withEvlog(() => {
      const logger = evlogStorage.getStore()!
      logger.set({ user: { id: '123', plan: 'enterprise' } })
      logger.set({ cart: { items: 5 } })
      return new Response('ok')
    })

    const request = new Request('http://localhost/api/checkout', { method: 'POST' })
    await handler(request)

    expect(consoleSpy).toHaveBeenCalled()
    const [[output]] = consoleSpy.mock.calls
    const parsed = JSON.parse(output)
    expect(parsed.user).toEqual({ id: '123', plan: 'enterprise' })
    expect(parsed.cart).toEqual({ items: 5 })
  })

  it('captures errors and re-throws them', async () => {
    const withEvlog = createWithEvlog({ pretty: false })

    const handler = withEvlog(() => {
      throw new Error('Something broke')
    })

    const request = new Request('http://localhost/api/test', { method: 'GET' })

    await expect(handler(request)).rejects.toThrow('Something broke')

    expect(consoleErrorSpy).toHaveBeenCalled()
    const [[output]] = consoleErrorSpy.mock.calls
    const parsed = JSON.parse(output)
    expect(parsed.level).toBe('error')
    expect(parsed.error.message).toBe('Something broke')
    expect(parsed.status).toBe(500)
  })

  it('extracts error status from error object', async () => {
    const withEvlog = createWithEvlog({ pretty: false })

    const handler = withEvlog(() => {
      const error = new Error('Not found') as Error & { status: number }
      error.status = 404
      throw error
    })

    const request = new Request('http://localhost/api/test', { method: 'GET' })
    await expect(handler(request)).rejects.toThrow('Not found')

    const [[output]] = consoleErrorSpy.mock.calls
    const parsed = JSON.parse(output)
    expect(parsed.status).toBe(404)
  })

  it('calls drain callback with emitted event', async () => {
    const drainMock = vi.fn()
    const withEvlog = createWithEvlog({ pretty: false, drain: drainMock })

    const handler = withEvlog(() => {
      return new Response('ok')
    })

    const request = new Request('http://localhost/api/test', { method: 'GET' })
    await handler(request)

    expect(drainMock).toHaveBeenCalledTimes(1)
    const [[drainCtx]] = drainMock.mock.calls
    expect(drainCtx.event).toBeDefined()
    expect(drainCtx.event.level).toBe('info')
    expect(drainCtx.request.method).toBe('GET')
    expect(drainCtx.request.path).toBe('/api/test')
  })

  it('calls enrich callback before drain', async () => {
    const callOrder: string[] = []
    const withEvlog = createWithEvlog({
      pretty: false,
      enrich: (ctx) => {
        callOrder.push('enrich')
        ctx.event.enriched = true
      },
      drain: (ctx) => {
        callOrder.push('drain')
        expect(ctx.event.enriched).toBe(true)
      },
    })

    const handler = withEvlog(() => new Response('ok'))
    const request = new Request('http://localhost/api/test', { method: 'GET' })
    await handler(request)

    expect(callOrder).toEqual(['enrich', 'drain'])
  })

  it('skips logging for excluded routes', async () => {
    const drainMock = vi.fn()
    const withEvlog = createWithEvlog({
      pretty: false,
      exclude: ['/_next/**', '/api/health'],
      drain: drainMock,
    })

    const handler = withEvlog(() => new Response('ok'))

    await handler(new Request('http://localhost/api/health', { method: 'GET' }))
    expect(drainMock).not.toHaveBeenCalled()
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('applies route-based service name', async () => {
    const withEvlog = createWithEvlog({
      pretty: false,
      routes: {
        '/api/auth/**': { service: 'auth-service' },
        '/api/**': { service: 'api-service' },
      },
    })

    const handler = withEvlog(() => new Response('ok'))
    await handler(new Request('http://localhost/api/auth/login', { method: 'POST' }))

    const [[output]] = consoleSpy.mock.calls
    const parsed = JSON.parse(output)
    expect(parsed.service).toBe('auth-service')
  })

  it('reuses x-request-id header from middleware', async () => {
    const withEvlog = createWithEvlog({ pretty: false })

    const handler = withEvlog(() => new Response('ok'))

    const request = new Request('http://localhost/api/test', {
      method: 'GET',
      headers: { 'x-request-id': 'custom-id-123' },
    })
    await handler(request)

    const [[output]] = consoleSpy.mock.calls
    const parsed = JSON.parse(output)
    expect(parsed.requestId).toBe('custom-id-123')
  })

  it('works with non-Request first argument (server actions)', async () => {
    const withEvlog = createWithEvlog({ pretty: false })

    const handler = withEvlog((formData: FormData) => {
      const logger = evlogStorage.getStore()!
      logger.set({ action: 'checkout' })
      return { success: true }
    })

    const formData = new FormData()
    formData.set('item', 'widget')
    const result = await handler(formData)

    expect(result).toEqual({ success: true })
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('passes through when logging is disabled', async () => {
    const withEvlog = createWithEvlog({ enabled: false, pretty: false })

    const handler = withEvlog(() => {
      const store = evlogStorage.getStore()
      // Logger exists but is a noop when disabled
      return new Response('ok')
    })

    const request = new Request('http://localhost/api/test', { method: 'GET' })
    const result = await handler(request)

    expect(result).toBeInstanceOf(Response)
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('generates a requestId when none is provided', async () => {
    const withEvlog = createWithEvlog({ pretty: false })

    const handler = withEvlog(() => new Response('ok'))
    await handler(new Request('http://localhost/api/test', { method: 'GET' }))

    const [[output]] = consoleSpy.mock.calls
    const parsed = JSON.parse(output)
    expect(parsed.requestId).toBeDefined()
    expect(typeof parsed.requestId).toBe('string')
    expect(parsed.requestId.length).toBeGreaterThan(0)
  })

  it('includes duration in emitted event', async () => {
    const withEvlog = createWithEvlog({ pretty: false })

    const handler = withEvlog(() => {
      return new Response('ok')
    })

    await handler(new Request('http://localhost/api/test', { method: 'GET' }))

    const [[output]] = consoleSpy.mock.calls
    const parsed = JSON.parse(output)
    expect(parsed.duration).toBeDefined()
  })

  it('handles drain errors gracefully', async () => {
    const withEvlog = createWithEvlog({
      pretty: false,
      drain: () => {
        throw new Error('drain failed')
      },
    })

    const handler = withEvlog(() => new Response('ok'))
    // Should not throw even when drain fails
    await expect(handler(new Request('http://localhost/api/test'))).resolves.toBeInstanceOf(Response)
  })

  it('calls keep callback and forces log retention on success path', async () => {
    const drainMock = vi.fn()
    const withEvlog = createWithEvlog({
      pretty: false,
      sampling: {
        rates: { info: 0 }, // Drop all info logs via head sampling
      },
      keep: (ctx) => {
        const user = ctx.context.user as { premium?: boolean } | undefined
        if (user?.premium) {
          ctx.shouldKeep = true
        }
      },
      drain: drainMock,
    })

    const handler = withEvlog(() => {
      const logger = evlogStorage.getStore()!
      logger.set({ user: { premium: true } })
      return new Response('ok')
    })

    await handler(new Request('http://localhost/api/test', { method: 'GET' }))

    // Should be drained because keep forced it
    expect(drainMock).toHaveBeenCalledTimes(1)
  })

  it('calls keep callback on error path', async () => {
    const drainMock = vi.fn()
    const withEvlog = createWithEvlog({
      pretty: false,
      sampling: {
        rates: { error: 0 }, // Drop all error logs via head sampling
      },
      keep: (ctx) => {
        if (ctx.status && ctx.status >= 500) {
          ctx.shouldKeep = true
        }
      },
      drain: drainMock,
    })

    const handler = withEvlog(() => {
      throw new Error('Server error')
    })

    await expect(handler(new Request('http://localhost/api/test'))).rejects.toThrow('Server error')

    // Should be drained because keep forced it
    expect(drainMock).toHaveBeenCalledTimes(1)
  })

  it('filters sensitive headers from drain context', async () => {
    const drainMock = vi.fn()
    const withEvlog = createWithEvlog({ pretty: false, drain: drainMock })

    const handler = withEvlog(() => new Response('ok'))

    const request = new Request('http://localhost/api/test', {
      method: 'GET',
      headers: {
        'authorization': 'Bearer secret',
        'cookie': 'session=abc',
        'x-custom': 'safe-value',
        'content-type': 'application/json',
      },
    })
    await handler(request)

    const [[drainCtx]] = drainMock.mock.calls
    expect(drainCtx.headers.authorization).toBeUndefined()
    expect(drainCtx.headers.cookie).toBeUndefined()
    expect(drainCtx.headers['x-custom']).toBe('safe-value')
    expect(drainCtx.headers['content-type']).toBe('application/json')
  })
})
