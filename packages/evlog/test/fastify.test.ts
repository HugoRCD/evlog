import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import { initLogger } from '../src/logger'
import { evlog, useLogger } from '../src/fastify/index'
import {
  assertDrainCalledWith,
  assertEnrichBeforeDrain,
  assertSensitiveHeadersFiltered,
  createPipelineSpies,
} from './helpers/framework'

describe('evlog/fastify', () => {
  beforeEach(() => {
    initLogger({
      env: { service: 'fastify-test' },
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

  it('creates a logger accessible via request.log', async () => {
    const app = Fastify({ logger: false })
    await app.register(evlog)

    let hasLogger = false
    app.get('/api/test', async (request) => {
      hasLogger = request.log !== null && typeof request.log.set === 'function'
      return { ok: true }
    })

    await app.inject({ method: 'GET', url: '/api/test' })
    expect(hasLogger).toBe(true)
  })

  it('emits event with correct method, path, and status', async () => {
    const app = Fastify({ logger: false })
    await app.register(evlog)
    app.get('/api/users', async () => ({ users: [] }))

    const consoleSpy = vi.mocked(console.info)
    await app.inject({ method: 'GET', url: '/api/users' })

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

  it('accumulates context set by route handler', async () => {
    const app = Fastify({ logger: false })
    await app.register(evlog)
    app.get('/api/users', async (request) => {
      request.log.set({ user: { id: 'u-1' }, db: { queries: 3 } })
      return { users: [] }
    })

    const consoleSpy = vi.mocked(console.info)
    await app.inject({ method: 'GET', url: '/api/users' })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"user"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.user.id).toBe('u-1')
    expect(event.db.queries).toBe(3)
  })

  it('logs error status when handler throws', async () => {
    const app = Fastify({ logger: false })
    await app.register(evlog)
    app.get('/api/fail', async (request) => {
      request.log.error(new Error('Something broke'))
      const error = new Error('Something broke') as Error & { statusCode?: number }
      error.statusCode = 500
      throw error
    })

    const errorSpy = vi.mocked(console.error)
    await app.inject({ method: 'GET', url: '/api/fail' })

    const lastCall = errorSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"level":"error"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.level).toBe('error')
  })

  it('skips routes not matching include patterns', async () => {
    const app = Fastify({ logger: false })
    await app.register(evlog, { include: ['/api/**'] })

    let isEvlogLogger = false
    app.get('/health', async (request) => {
      isEvlogLogger = typeof request.log.set === 'function'
      return { ok: true }
    })

    await app.inject({ method: 'GET', url: '/health' })
    expect(isEvlogLogger).toBe(false)
  })

  it('logs routes matching include patterns', async () => {
    const app = Fastify({ logger: false })
    await app.register(evlog, { include: ['/api/**'] })
    app.get('/api/data', async (request) => {
      request.log.set({ data: true })
      return { ok: true }
    })

    const consoleSpy = vi.mocked(console.info)
    await app.inject({ method: 'GET', url: '/api/data' })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"path":"/api/data"'),
    )
    expect(lastCall).toBeDefined()
  })

  it('uses x-request-id header when present', async () => {
    const app = Fastify({ logger: false })
    await app.register(evlog)
    app.get('/api/test', async () => ({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await app.inject({
      method: 'GET',
      url: '/api/test',
      headers: { 'x-request-id': 'custom-req-id' },
    })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('custom-req-id'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.requestId).toBe('custom-req-id')
  })

  it('handles POST requests with correct method', async () => {
    const app = Fastify({ logger: false })
    await app.register(evlog)
    app.post('/api/checkout', async () => ({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await app.inject({ method: 'POST', url: '/api/checkout' })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"method":"POST"'),
    )
    expect(lastCall).toBeDefined()
  })

  it('excludes routes matching exclude patterns', async () => {
    const app = Fastify({ logger: false })
    await app.register(evlog, { exclude: ['/_internal/**'] })

    let isEvlogLogger = false
    app.get('/_internal/probe', async (request) => {
      isEvlogLogger = typeof request.log.set === 'function'
      return { ok: true }
    })

    await app.inject({ method: 'GET', url: '/_internal/probe' })
    expect(isEvlogLogger).toBe(false)
  })

  it('applies route-based service override', async () => {
    const app = Fastify({ logger: false })
    await app.register(evlog, {
      routes: { '/api/auth/**': { service: 'auth-service' } },
    })
    app.get('/api/auth/login', async () => ({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await app.inject({ method: 'GET', url: '/api/auth/login' })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"service":"auth-service"'),
    )
    expect(lastCall).toBeDefined()
  })

  describe('drain / enrich / keep', () => {
    it('calls drain with emitted event (shared helpers)', async () => {
      const { drain } = createPipelineSpies()

      const app = Fastify({ logger: false })
      await app.register(evlog, { drain })
      app.get('/api/test', async (request) => {
        request.log.set({ user: { id: 'u-1' } })
        return { ok: true }
      })

      await app.inject({ method: 'GET', url: '/api/test' })

      assertDrainCalledWith(drain, { path: '/api/test', method: 'GET', level: 'info', status: 200 })
      const [[ctx]] = drain.mock.calls
      expect(ctx.headers).toBeDefined()
    })

    it('calls enrich before drain (shared helpers)', async () => {
      const { drain, enrich } = createPipelineSpies()
      enrich.mockImplementation((ctx) => {
        ctx.event.enriched = true
      })

      const app = Fastify({ logger: false })
      await app.register(evlog, { enrich, drain })
      app.get('/api/test', async () => ({ ok: true }))

      await app.inject({ method: 'GET', url: '/api/test' })

      assertEnrichBeforeDrain(enrich, drain)
      expect(drain.mock.calls[0][0].event.enriched).toBe(true)
    })

    it('enrich receives response status and safe headers', async () => {
      const { enrich } = createPipelineSpies()

      const app = Fastify({ logger: false })
      await app.register(evlog, { enrich })
      app.get('/api/test', async () => ({ ok: true }))

      await app.inject({
        method: 'GET',
        url: '/api/test',
        headers: {
          'user-agent': 'test-bot/1.0',
          'x-custom': 'value',
        },
      })

      expect(enrich).toHaveBeenCalledOnce()
      const [[ctx]] = enrich.mock.calls
      expect(ctx.response!.status).toBe(200)
      expect(ctx.headers!['user-agent']).toBe('test-bot/1.0')
      expect(ctx.headers!['x-custom']).toBe('value')
    })

    it('filters sensitive headers (shared helpers)', async () => {
      const { drain } = createPipelineSpies()

      const app = Fastify({ logger: false })
      await app.register(evlog, { drain })
      app.get('/api/test', async () => ({ ok: true }))

      await app.inject({
        method: 'GET',
        url: '/api/test',
        headers: {
          'authorization': 'Bearer secret-token',
          'cookie': 'session=abc',
          'x-safe': 'visible',
        },
      })

      assertSensitiveHeadersFiltered(drain.mock.calls[0][0])
      expect(drain.mock.calls[0][0].headers!['x-safe']).toBe('visible')
    })

    it('calls keep callback for tail sampling', async () => {
      const { keep, drain } = createPipelineSpies()
      keep.mockImplementation((ctx) => {
        if (ctx.context.important) ctx.shouldKeep = true
      })

      const app = Fastify({ logger: false })
      await app.register(evlog, { keep, drain })
      app.get('/api/test', async (request) => {
        request.log.set({ important: true })
        return { ok: true }
      })

      await app.inject({ method: 'GET', url: '/api/test' })

      expect(keep).toHaveBeenCalledOnce()
      expect(keep.mock.calls[0][0].path).toBe('/api/test')
      expect(drain).toHaveBeenCalledOnce()
    })

    it('drain error does not break request', async () => {
      const drain = vi.fn(() => {
        throw new Error('drain exploded')
      })

      const app = Fastify({ logger: false })
      await app.register(evlog, { drain })
      app.get('/api/test', async () => ({ ok: true }))

      const res = await app.inject({ method: 'GET', url: '/api/test' })
      expect(res.statusCode).toBe(200)
      expect(drain).toHaveBeenCalledOnce()
    })

    it('enrich error does not prevent drain', async () => {
      const { drain } = createPipelineSpies()
      const enrich = vi.fn(() => {
        throw new Error('enrich exploded')
      })

      const app = Fastify({ logger: false })
      await app.register(evlog, { enrich, drain })
      app.get('/api/test', async () => ({ ok: true }))

      const res = await app.inject({ method: 'GET', url: '/api/test' })
      expect(res.statusCode).toBe(200)
      expect(enrich).toHaveBeenCalledOnce()
      expect(drain).toHaveBeenCalledOnce()
    })

    it('does not call drain/enrich when route is skipped', async () => {
      const { drain, enrich } = createPipelineSpies()

      const app = Fastify({ logger: false })
      await app.register(evlog, { include: ['/api/**'], drain, enrich })
      app.get('/health', async () => ({ ok: true }))

      await app.inject({ method: 'GET', url: '/health' })

      expect(drain).not.toHaveBeenCalled()
      expect(enrich).not.toHaveBeenCalled()
    })
  })

  describe('useLogger()', () => {
    it('returns the request-scoped logger from anywhere in the call stack', async () => {
      const app = Fastify({ logger: false })
      await app.register(evlog)

      let loggerFromService: unknown
      function serviceFunction() {
        loggerFromService = useLogger()
        useLogger().set({ fromService: true })
      }

      app.get('/api/test', async (_request) => {
        serviceFunction()
        return { ok: true }
      })

      const consoleSpy = vi.mocked(console.info)
      await app.inject({ method: 'GET', url: '/api/test' })

      expect(loggerFromService).toBeDefined()
      expect(typeof (loggerFromService as Record<string, unknown>).set).toBe('function')

      const lastCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"fromService":true'),
      )
      expect(lastCall).toBeDefined()
    })

    it('returns the same logger as request.log', async () => {
      const app = Fastify({ logger: false })
      await app.register(evlog)

      let isSame = false
      app.get('/api/test', async (request) => {
        isSame = useLogger() === request.log
        return { ok: true }
      })

      await app.inject({ method: 'GET', url: '/api/test' })
      expect(isSame).toBe(true)
    })

    it('throws when called outside plugin context', () => {
      expect(() => useLogger()).toThrow('[evlog] useLogger()')
    })

    it('works across async boundaries', async () => {
      const app = Fastify({ logger: false })
      await app.register(evlog)

      async function asyncService() {
        await new Promise(resolve => setTimeout(resolve, 5))
        useLogger().set({ asyncWork: 'done' })
      }

      app.get('/api/test', async (_request) => {
        await asyncService()
        return { ok: true }
      })

      const consoleSpy = vi.mocked(console.info)
      await app.inject({ method: 'GET', url: '/api/test' })

      const lastCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"asyncWork":"done"'),
      )
      expect(lastCall).toBeDefined()
    })
  })
})
