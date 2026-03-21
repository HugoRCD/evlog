import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initLogger } from '../src/logger'
import { evlog, loggerContext, useLogger } from '../src/react-router/index'
import {
  assertDrainCalledWith,
  assertEnrichBeforeDrain,
  assertSensitiveHeadersFiltered,
  createPipelineSpies,
} from './helpers/framework'

function createMockContext() {
  const store = new Map<unknown, unknown>()
  return {
    set: (key: unknown, value: unknown) => store.set(key, value),
    get: (key: unknown) => store.get(key),
  }
}

function createRequest(path: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, init)
}

function okResponse() {
  return Promise.resolve(new Response('ok', { status: 200 }))
}

describe('evlog/react-router', () => {
  beforeEach(() => {
    initLogger({
      env: { service: 'react-router-test' },
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

  it('creates a logger accessible via context.get(loggerContext)', async () => {
    const middleware = evlog()
    const context = createMockContext()
    const next = vi.fn(() => okResponse())

    await middleware({ request: createRequest('/api/test'), context }, next)

    const logger = context.get(loggerContext)
    expect(logger).toBeDefined()
    expect(typeof logger.set).toBe('function')
  })

  it('emits event with correct method, path, and status', async () => {
    const middleware = evlog()
    const context = createMockContext()
    const next = vi.fn(() => okResponse())

    const consoleSpy = vi.mocked(console.info)
    await middleware({ request: createRequest('/api/users'), context }, next)

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"path":"/api/users"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.method).toBe('GET')
    expect(event.path).toBe('/api/users')
    expect(event.status).toBe(200)
    expect(event.level).toBe('info')
    expect(event.duration).toBeDefined()
  })

  it('accumulates context set by loader', async () => {
    const middleware = evlog()
    const context = createMockContext()
    const next = vi.fn(() => {
      const logger = context.get(loggerContext) as any
      logger.set({ user: { id: 'u-1' }, db: { queries: 3 } })
      return okResponse()
    })

    const consoleSpy = vi.mocked(console.info)
    await middleware({ request: createRequest('/api/users'), context }, next)

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"user"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.user.id).toBe('u-1')
    expect(event.db.queries).toBe(3)
  })

  it('logs status 500 when handler throws', async () => {
    const middleware = evlog()
    const context = createMockContext()
    const next = vi.fn(() => Promise.reject(new Error('Something broke')))

    const errorSpy = vi.mocked(console.error)
    await expect(
      middleware({ request: createRequest('/api/fail'), context }, next),
    ).rejects.toThrow('Something broke')

    const lastCall = errorSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"path":"/api/fail"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.status).toBe(500)
    expect(event.path).toBe('/api/fail')
  })

  it('re-throws all errors from handler', async () => {
    const middleware = evlog()
    const context = createMockContext()
    const next = vi.fn(() => Promise.reject(new TypeError('unexpected')))

    await expect(
      middleware({ request: createRequest('/api/fail'), context }, next),
    ).rejects.toThrow('unexpected')
  })

  it('skips routes not matching include patterns', async () => {
    const middleware = evlog({ include: ['/api/**'] })
    const context = createMockContext()
    const next = vi.fn(() => okResponse())

    await middleware({ request: createRequest('/health'), context }, next)

    const logger = context.get(loggerContext)
    expect(logger).toBeUndefined()
  })

  it('logs routes matching include patterns', async () => {
    const middleware = evlog({ include: ['/api/**'] })
    const context = createMockContext()
    const next = vi.fn(() => okResponse())

    const consoleSpy = vi.mocked(console.info)
    await middleware({ request: createRequest('/api/data'), context }, next)

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"path":"/api/data"'),
    )
    expect(lastCall).toBeDefined()
  })

  it('uses x-request-id header when present', async () => {
    const middleware = evlog()
    const context = createMockContext()
    const next = vi.fn(() => okResponse())

    const consoleSpy = vi.mocked(console.info)
    await middleware({
      request: createRequest('/api/test', {
        headers: { 'x-request-id': 'custom-req-id' },
      }),
      context,
    }, next)

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('custom-req-id'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.requestId).toBe('custom-req-id')
  })

  it('handles POST requests with correct method', async () => {
    const middleware = evlog()
    const context = createMockContext()
    const next = vi.fn(() => okResponse())

    const consoleSpy = vi.mocked(console.info)
    await middleware({
      request: createRequest('/api/checkout', { method: 'POST' }),
      context,
    }, next)

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"method":"POST"'),
    )
    expect(lastCall).toBeDefined()
  })

  it('excludes routes matching exclude patterns', async () => {
    const middleware = evlog({ exclude: ['/_internal/**'] })
    const context = createMockContext()
    const next = vi.fn(() => okResponse())

    await middleware({ request: createRequest('/_internal/probe'), context }, next)

    const logger = context.get(loggerContext)
    expect(logger).toBeUndefined()
  })

  it('applies route-based service override', async () => {
    const middleware = evlog({
      routes: { '/api/auth/**': { service: 'auth-service' } },
    })
    const context = createMockContext()
    const next = vi.fn(() => okResponse())

    const consoleSpy = vi.mocked(console.info)
    await middleware({ request: createRequest('/api/auth/login'), context }, next)

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"service":"auth-service"'),
    )
    expect(lastCall).toBeDefined()
  })

  describe('drain / enrich / keep', () => {
    it('calls drain with emitted event (shared helpers)', async () => {
      const { drain } = createPipelineSpies()

      const middleware = evlog({ drain })
      const context = createMockContext()
      const next = vi.fn(() => {
        const logger = context.get(loggerContext) as any
        logger.set({ user: { id: 'u-1' } })
        return okResponse()
      })

      await middleware({ request: createRequest('/api/test'), context }, next)

      assertDrainCalledWith(drain, { path: '/api/test', method: 'GET', level: 'info', status: 200 })
      const [[ctx]] = drain.mock.calls
      expect(ctx.headers).toBeDefined()
    })

    it('calls enrich before drain (shared helpers)', async () => {
      const { drain, enrich } = createPipelineSpies()
      enrich.mockImplementation((ctx) => {
        ctx.event.enriched = true
      })

      const middleware = evlog({ enrich, drain })
      const context = createMockContext()
      const next = vi.fn(() => okResponse())

      await middleware({ request: createRequest('/api/test'), context }, next)

      assertEnrichBeforeDrain(enrich, drain)
      expect(drain.mock.calls[0][0].event.enriched).toBe(true)
    })

    it('enrich receives response status and safe headers', async () => {
      const { enrich } = createPipelineSpies()

      const middleware = evlog({ enrich })
      const context = createMockContext()
      const next = vi.fn(() => okResponse())

      await middleware({
        request: createRequest('/api/test', {
          headers: { 'user-agent': 'test-bot/1.0', 'x-custom': 'value' },
        }),
        context,
      }, next)

      expect(enrich).toHaveBeenCalledOnce()
      const [[ctx]] = enrich.mock.calls
      expect(ctx.response!.status).toBe(200)
      expect(ctx.headers!['user-agent']).toBe('test-bot/1.0')
      expect(ctx.headers!['x-custom']).toBe('value')
    })

    it('filters sensitive headers (shared helpers)', async () => {
      const { drain } = createPipelineSpies()

      const middleware = evlog({ drain })
      const context = createMockContext()
      const next = vi.fn(() => okResponse())

      await middleware({
        request: createRequest('/api/test', {
          headers: {
            'authorization': 'Bearer secret-token',
            'cookie': 'session=abc',
            'x-safe': 'visible',
          },
        }),
        context,
      }, next)

      assertSensitiveHeadersFiltered(drain.mock.calls[0][0])
      expect(drain.mock.calls[0][0].headers!['x-safe']).toBe('visible')
    })

    it('calls keep callback for tail sampling', async () => {
      const { keep, drain } = createPipelineSpies()
      keep.mockImplementation((ctx) => {
        if (ctx.context.important) ctx.shouldKeep = true
      })

      const middleware = evlog({ keep, drain })
      const context = createMockContext()
      const next = vi.fn(() => {
        const logger = context.get(loggerContext) as any
        logger.set({ important: true })
        return okResponse()
      })

      await middleware({ request: createRequest('/api/test'), context }, next)

      expect(keep).toHaveBeenCalledOnce()
      expect(keep.mock.calls[0][0].path).toBe('/api/test')
      expect(drain).toHaveBeenCalledOnce()
    })

    it('calls drain on error responses', async () => {
      const { drain } = createPipelineSpies()

      const middleware = evlog({ drain })
      const context = createMockContext()
      const next = vi.fn(() => {
        const logger = context.get(loggerContext) as any
        logger.error(new Error('something broke'))
        return Promise.resolve(new Response('error', { status: 500 }))
      })

      await middleware({ request: createRequest('/api/fail'), context }, next)

      assertDrainCalledWith(drain, { path: '/api/fail', level: 'error', status: 500 })
    })

    it('drain error does not break request', async () => {
      const drain = vi.fn(() => {
        throw new Error('drain exploded')
      })

      const middleware = evlog({ drain })
      const context = createMockContext()
      const next = vi.fn(() => okResponse())

      const response = await middleware({ request: createRequest('/api/test'), context }, next)
      expect(response.status).toBe(200)
      expect(drain).toHaveBeenCalledOnce()
    })

    it('enrich error does not prevent drain', async () => {
      const { drain } = createPipelineSpies()
      const enrich = vi.fn(() => {
        throw new Error('enrich exploded')
      })

      const middleware = evlog({ enrich, drain })
      const context = createMockContext()
      const next = vi.fn(() => okResponse())

      const response = await middleware({ request: createRequest('/api/test'), context }, next)
      expect(response.status).toBe(200)
      expect(enrich).toHaveBeenCalledOnce()
      expect(drain).toHaveBeenCalledOnce()
    })

    it('does not call drain/enrich when route is skipped', async () => {
      const { drain, enrich } = createPipelineSpies()

      const middleware = evlog({ include: ['/api/**'], drain, enrich })
      const context = createMockContext()
      const next = vi.fn(() => okResponse())

      await middleware({ request: createRequest('/health'), context }, next)

      expect(drain).not.toHaveBeenCalled()
      expect(enrich).not.toHaveBeenCalled()
    })
  })

  describe('useLogger', () => {
    it('returns same logger in middleware context', async () => {
      let loggerFromUseLogger: any

      const middleware = evlog()
      const context = createMockContext()
      const next = vi.fn(() => {
        loggerFromUseLogger = useLogger()
        return okResponse()
      })

      await middleware({ request: createRequest('/api/test'), context }, next)

      const loggerFromContext = context.get(loggerContext)
      expect(loggerFromUseLogger).toBe(loggerFromContext)
    })

    it('throws outside middleware context', () => {
      expect(() => useLogger()).toThrow('[evlog] useLogger()')
    })

    it('works across async boundaries', async () => {
      let loggerFromAsync: any

      const middleware = evlog()
      const context = createMockContext()
      const next = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 1))
        loggerFromAsync = useLogger()
        return new Response('ok', { status: 200 })
      })

      await middleware({ request: createRequest('/api/test'), context }, next)

      expect(loggerFromAsync).toBeDefined()
      expect(typeof loggerFromAsync.set).toBe('function')
    })
  })
})
