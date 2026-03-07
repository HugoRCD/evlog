import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initLogger } from '../src/logger'
import { evlog, evlogHandleError, createEvlogHooks, useLogger } from '../src/sveltekit/index'
import { EvlogError } from '../src/error'
import {
  assertDrainCalledWith,
  assertEnrichBeforeDrain,
  assertSensitiveHeadersFiltered,
  createPipelineSpies,
} from './helpers/framework'

function createMockEvent(method = 'GET', path = '/api/test', headers: Record<string, string> = {}) {
  const reqHeaders = new Headers(headers)
  return {
    request: new Request(`http://localhost${path}`, { method, headers: reqHeaders }),
    url: new URL(`http://localhost${path}`),
    locals: {} as Record<string, any>,
  }
}

function createMockResolve(status = 200) {
  return vi.fn(() => new Response(JSON.stringify({ ok: true }), { status }))
}

describe('evlog/sveltekit', () => {
  beforeEach(() => {
    initLogger({
      env: { service: 'sveltekit-test' },
      pretty: false,
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a logger accessible via event.locals.log', async () => {
    const handle = evlog()
    const event = createMockEvent()
    const resolve = createMockResolve()

    await handle({ event, resolve })

    expect(event.locals.log).toBeDefined()
    expect(typeof event.locals.log.set).toBe('function')
    expect(typeof event.locals.log.error).toBe('function')
    expect(typeof event.locals.log.info).toBe('function')
    expect(typeof event.locals.log.warn).toBe('function')
  })

  it('emits event with correct method, path, and status', async () => {
    const handle = evlog()
    const event = createMockEvent('GET', '/api/users')
    const resolve = createMockResolve()

    const consoleSpy = vi.mocked(console.info)
    await handle({ event, resolve })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"path":"/api/users"'),
    )
    expect(lastCall).toBeDefined()

    const emitted = JSON.parse(lastCall![0] as string)
    expect(emitted.method).toBe('GET')
    expect(emitted.path).toBe('/api/users')
    expect(emitted.status).toBe(200)
    expect(emitted.level).toBe('info')
    expect(emitted.duration).toBeDefined()
  })

  it('accumulates context set by route handler', async () => {
    const handle = evlog()
    const event = createMockEvent('GET', '/api/users')
    const resolve = vi.fn((ev: any) => {
      ev.locals.log.set({ user: { id: 'u-1' }, db: { queries: 3 } })
      return new Response(JSON.stringify({ users: [] }), { status: 200 })
    })

    const consoleSpy = vi.mocked(console.info)
    await handle({ event, resolve })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"user"'),
    )
    expect(lastCall).toBeDefined()

    const emitted = JSON.parse(lastCall![0] as string)
    expect(emitted.user.id).toBe('u-1')
    expect(emitted.db.queries).toBe(3)
  })

  it('logs error status when handler throws', async () => {
    const handle = evlog()
    const event = createMockEvent('GET', '/api/fail')
    const resolve = vi.fn(() => {
      throw new Error('Something broke')
    })

    const errorSpy = vi.mocked(console.error)
    await expect(handle({ event, resolve })).rejects.toThrow('Something broke')

    const lastCall = errorSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"level":"error"'),
    )
    expect(lastCall).toBeDefined()

    const emitted = JSON.parse(lastCall![0] as string)
    expect(emitted.level).toBe('error')
  })

  it('returns structured JSON response for thrown EvlogError', async () => {
    const handle = evlog()
    const event = createMockEvent('GET', '/api/checkout')
    const resolve = vi.fn(() => {
      throw new EvlogError({
        message: 'Payment failed',
        status: 402,
        why: 'Card declined by issuer',
        fix: 'Try a different card',
        link: 'https://docs.example.com/payments',
      })
    })

    const response = await handle({ event, resolve })

    expect(response.status).toBe(402)
    expect(response.headers.get('content-type')).toBe('application/json')

    const body = await response.json()
    expect(body.message).toBe('Payment failed')
    expect(body.data.why).toBe('Card declined by issuer')
    expect(body.data.fix).toBe('Try a different card')
    expect(body.data.link).toBe('https://docs.example.com/payments')
  })

  it('logs EvlogError before returning structured response', async () => {
    const { drain } = createPipelineSpies()
    const handle = evlog({ drain })
    const event = createMockEvent('GET', '/api/checkout')
    const resolve = vi.fn(() => {
      throw new EvlogError({ message: 'Payment failed', status: 402 })
    })

    await handle({ event, resolve })

    expect(drain).toHaveBeenCalledOnce()
    const [[drainCtx]] = drain.mock.calls
    expect(drainCtx.event.level).toBe('error')
    expect(drainCtx.event.status).toBe(402)
  })

  it('re-throws non-EvlogError errors', async () => {
    const handle = evlog()
    const event = createMockEvent('GET', '/api/fail')
    const resolve = vi.fn(() => {
      throw new Error('Unexpected crash')
    })

    await expect(handle({ event, resolve })).rejects.toThrow('Unexpected crash')
  })

  it('intercepts 500 response when handleError logged an EvlogError', async () => {
    // Simulate SvelteKit's behavior: resolve() catches the error via handleError,
    // then returns a 500 Response. Our handle hook should detect the EvlogError
    // from the logger context and return a structured response instead.
    const handle = evlog()
    const handleError = evlogHandleError()
    const event = createMockEvent('GET', '/api/checkout')

    const evlogError = new EvlogError({
      message: 'Payment failed',
      status: 402,
      why: 'Card declined',
      fix: 'Try another card',
    })

    // Simulate SvelteKit's resolve: calls handleError, then returns 500
    const resolve = vi.fn(() => {
      // SvelteKit calls handleError before returning the response
      handleError({ error: evlogError, event, status: 500, message: 'Internal Error' })
      return new Response('Internal Error', { status: 500 })
    })

    const response = await handle({ event, resolve })

    // Should intercept the 500 and return structured 402
    expect(response.status).toBe(402)
    expect(response.headers.get('content-type')).toBe('application/json')

    const body = await response.json()
    expect(body.message).toBe('Payment failed')
    expect(body.status).toBe(402)
    expect(body.data.why).toBe('Card declined')
    expect(body.data.fix).toBe('Try another card')
  })

  it('skips routes not matching include patterns', async () => {
    const handle = evlog({ include: ['/api/**'] })
    const event = createMockEvent('GET', '/health')
    const resolve = createMockResolve()

    await handle({ event, resolve })

    expect(event.locals.log).toBeUndefined()
  })

  it('logs routes matching include patterns', async () => {
    const handle = evlog({ include: ['/api/**'] })
    const event = createMockEvent('GET', '/api/data')
    const resolve = createMockResolve()

    const consoleSpy = vi.mocked(console.info)
    await handle({ event, resolve })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"path":"/api/data"'),
    )
    expect(lastCall).toBeDefined()
  })

  it('uses x-request-id header when present', async () => {
    const handle = evlog()
    const event = createMockEvent('GET', '/api/test', { 'x-request-id': 'custom-req-id' })
    const resolve = createMockResolve()

    const consoleSpy = vi.mocked(console.info)
    await handle({ event, resolve })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('custom-req-id'),
    )
    expect(lastCall).toBeDefined()

    const emitted = JSON.parse(lastCall![0] as string)
    expect(emitted.requestId).toBe('custom-req-id')
  })

  it('handles POST requests with correct method', async () => {
    const handle = evlog()
    const event = createMockEvent('POST', '/api/checkout')
    const resolve = createMockResolve()

    const consoleSpy = vi.mocked(console.info)
    await handle({ event, resolve })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"method":"POST"'),
    )
    expect(lastCall).toBeDefined()
  })

  it('excludes routes matching exclude patterns', async () => {
    const handle = evlog({ exclude: ['/_internal/**'] })
    const event = createMockEvent('GET', '/_internal/probe')
    const resolve = createMockResolve()

    await handle({ event, resolve })

    expect(event.locals.log).toBeUndefined()
  })

  it('applies route-based service override', async () => {
    const handle = evlog({
      routes: { '/api/auth/**': { service: 'auth-service' } },
    })
    const event = createMockEvent('GET', '/api/auth/login')
    const resolve = createMockResolve()

    const consoleSpy = vi.mocked(console.info)
    await handle({ event, resolve })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"service":"auth-service"'),
    )
    expect(lastCall).toBeDefined()
  })

  describe('drain / enrich / keep', () => {
    it('calls drain with emitted event (shared helpers)', async () => {
      const { drain } = createPipelineSpies()

      const handle = evlog({ drain })
      const event = createMockEvent('GET', '/api/test')
      const resolve = vi.fn((ev: any) => {
        ev.locals.log.set({ user: { id: 'u-1' } })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      })

      await handle({ event, resolve })

      assertDrainCalledWith(drain, { path: '/api/test', method: 'GET', level: 'info', status: 200 })
      const [[ctx]] = drain.mock.calls
      expect(ctx.headers).toBeDefined()
    })

    it('calls enrich before drain (shared helpers)', async () => {
      const { drain, enrich } = createPipelineSpies()
      enrich.mockImplementation((ctx) => {
        ctx.event.enriched = true
      })

      const handle = evlog({ enrich, drain })
      const event = createMockEvent('GET', '/api/test')
      const resolve = createMockResolve()

      await handle({ event, resolve })

      assertEnrichBeforeDrain(enrich, drain)
      expect(drain.mock.calls[0][0].event.enriched).toBe(true)
    })

    it('enrich receives response status and safe headers', async () => {
      const { enrich } = createPipelineSpies()

      const handle = evlog({ enrich })
      const event = createMockEvent('GET', '/api/test', {
        'user-agent': 'test-bot/1.0',
        'x-custom': 'value',
      })
      const resolve = createMockResolve()

      await handle({ event, resolve })

      expect(enrich).toHaveBeenCalledOnce()
      const [[ctx]] = enrich.mock.calls
      expect(ctx.response!.status).toBe(200)
      expect(ctx.headers!['user-agent']).toBe('test-bot/1.0')
      expect(ctx.headers!['x-custom']).toBe('value')
    })

    it('filters sensitive headers (shared helpers)', async () => {
      const { drain } = createPipelineSpies()

      const handle = evlog({ drain })
      const event = createMockEvent('GET', '/api/test', {
        'authorization': 'Bearer secret-token',
        'cookie': 'session=abc',
        'x-safe': 'visible',
      })
      const resolve = createMockResolve()

      await handle({ event, resolve })

      assertSensitiveHeadersFiltered(drain.mock.calls[0][0])
      expect(drain.mock.calls[0][0].headers!['x-safe']).toBe('visible')
    })

    it('calls keep callback for tail sampling', async () => {
      const { keep, drain } = createPipelineSpies()
      keep.mockImplementation((ctx) => {
        if (ctx.context.important) ctx.shouldKeep = true
      })

      const handle = evlog({ keep, drain })
      const event = createMockEvent('GET', '/api/test')
      const resolve = vi.fn((ev: any) => {
        ev.locals.log.set({ important: true })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      })

      await handle({ event, resolve })

      expect(keep).toHaveBeenCalledOnce()
      expect(keep.mock.calls[0][0].path).toBe('/api/test')
      expect(drain).toHaveBeenCalledOnce()
    })

    it('drain error does not break request', async () => {
      const drain = vi.fn(() => {
        throw new Error('drain exploded')
      })

      const handle = evlog({ drain })
      const event = createMockEvent('GET', '/api/test')
      const resolve = createMockResolve()

      const response = await handle({ event, resolve })
      expect(response.status).toBe(200)
      expect(drain).toHaveBeenCalledOnce()
    })

    it('enrich error does not prevent drain', async () => {
      const { drain } = createPipelineSpies()
      const enrich = vi.fn(() => {
        throw new Error('enrich exploded')
      })

      const handle = evlog({ enrich, drain })
      const event = createMockEvent('GET', '/api/test')
      const resolve = createMockResolve()

      const response = await handle({ event, resolve })
      expect(response.status).toBe(200)
      expect(enrich).toHaveBeenCalledOnce()
      expect(drain).toHaveBeenCalledOnce()
    })

    it('does not call drain/enrich when route is skipped', async () => {
      const { drain, enrich } = createPipelineSpies()

      const handle = evlog({ include: ['/api/**'], drain, enrich })
      const event = createMockEvent('GET', '/health')
      const resolve = createMockResolve()

      await handle({ event, resolve })

      expect(drain).not.toHaveBeenCalled()
      expect(enrich).not.toHaveBeenCalled()
    })
  })

  describe('useLogger()', () => {
    it('returns the request-scoped logger from anywhere in the call stack', async () => {
      const handle = evlog()

      let loggerFromService: unknown
      const resolve = vi.fn(() => {
        loggerFromService = useLogger()
        useLogger().set({ fromService: true })
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      })

      const event = createMockEvent('GET', '/api/test')
      const consoleSpy = vi.mocked(console.info)
      await handle({ event, resolve })

      expect(loggerFromService).toBeDefined()
      expect(typeof (loggerFromService as Record<string, unknown>).set).toBe('function')

      const lastCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"fromService":true'),
      )
      expect(lastCall).toBeDefined()
    })

    it('returns the same logger as event.locals.log', async () => {
      const handle = evlog()

      let isSame = false
      const event = createMockEvent('GET', '/api/test')
      const resolve = vi.fn(() => {
        isSame = useLogger() === event.locals.log
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      })

      await handle({ event, resolve })
      expect(isSame).toBe(true)
    })

    it('throws when called outside handle context', () => {
      expect(() => useLogger()).toThrow('[evlog] useLogger()')
    })

    it('works across async boundaries', async () => {
      const handle = evlog()

      async function asyncService() {
        await new Promise(resolve => setTimeout(resolve, 5))
        useLogger().set({ asyncWork: 'done' })
      }

      const resolve = vi.fn(async () => {
        await asyncService()
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      })

      const event = createMockEvent('GET', '/api/test')
      const consoleSpy = vi.mocked(console.info)
      await handle({ event, resolve })

      const lastCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"asyncWork":"done"'),
      )
      expect(lastCall).toBeDefined()
    })
  })

  describe('evlogHandleError()', () => {
    it('logs error via event.locals.log when available', async () => {
      const handle = evlog()
      const handleError = evlogHandleError()
      const event = createMockEvent('GET', '/api/fail')

      // First set up the logger via the handle hook
      const resolve = vi.fn(() => {
        throw new Error('Something broke')
      })
      await handle({ event, resolve }).catch(() => {})

      // Now call handleError as SvelteKit would
      const error = new Error('Something broke')
      handleError({ error, event, status: 500, message: 'Internal Error' })

      // The error should have been logged via locals.log
      expect(event.locals.log).toBeDefined()
    })

    it('returns structured response for EvlogError', () => {
      const handleError = evlogHandleError()
      const event = createMockEvent('GET', '/api/checkout')
      event.locals.log = {
        set() {},
        error() {},
        info() {},
        warn() {},
        emit() {
          return null
        },
        getContext() {
          return {}
        },
      }

      const error = new EvlogError({
        message: 'Payment failed',
        status: 402,
        why: 'Card declined',
        fix: 'Try another card',
        link: 'https://docs.example.com/payments',
      })

      const result = handleError({ error, event, status: 402, message: 'Payment failed' })

      expect(result).toBeDefined()
      expect((result as any).message).toBe('Payment failed')
      expect((result as any).status).toBe(402)
      expect((result as any).why).toBe('Card declined')
      expect((result as any).fix).toBe('Try another card')
      expect((result as any).link).toBe('https://docs.example.com/payments')
    })

    it('returns generic response for non-EvlogError', () => {
      const handleError = evlogHandleError()
      const event = createMockEvent('GET', '/api/fail')
      event.locals.log = {
        set() {},
        error() {},
        info() {},
        warn() {},
        emit() {
          return null
        },
        getContext() {
          return {}
        },
      }

      const result = handleError({
        error: new Error('Something broke'),
        event,
        status: 500,
        message: 'Internal Error',
      })

      expect(result).toBeDefined()
      expect((result as any).message).toBe('Internal Error')
      expect((result as any).status).toBe(500)
      expect((result as any).why).toBeUndefined()
    })

    it('handles missing logger gracefully', () => {
      const handleError = evlogHandleError()
      const event = createMockEvent('GET', '/api/fail')
      // No locals.log set

      const result = handleError({
        error: new Error('crash'),
        event,
        status: 500,
        message: 'Internal Error',
      })

      expect(result).toBeDefined()
      expect((result as any).message).toBe('Internal Error')
    })
  })

  describe('createEvlogHooks()', () => {
    it('returns both handle and handleError', () => {
      const hooks = createEvlogHooks()
      expect(typeof hooks.handle).toBe('function')
      expect(typeof hooks.handleError).toBe('function')
    })

    it('handle works with options', async () => {
      const { drain } = createPipelineSpies()
      const { handle } = createEvlogHooks({ drain })
      const event = createMockEvent('GET', '/api/test')
      const resolve = createMockResolve()

      await handle({ event, resolve })

      expect(drain).toHaveBeenCalledOnce()
      expect(event.locals.log).toBeDefined()
    })

    it('handleError returns structured EvlogError response', () => {
      const { handleError } = createEvlogHooks()
      const event = createMockEvent('GET', '/api/checkout')
      event.locals.log = {
        set() {},
        error() {},
        info() {},
        warn() {},
        emit() {
          return null
        },
        getContext() {
          return {}
        },
      }

      const error = new EvlogError({
        message: 'Payment failed',
        status: 402,
        why: 'Card declined',
      })

      const result = handleError({ error, event, status: 402, message: 'Payment failed' })
      expect((result as any).why).toBe('Card declined')
    })
  })
})
