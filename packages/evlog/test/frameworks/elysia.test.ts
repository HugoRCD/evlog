import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Elysia } from 'elysia'
import { initLogger } from '../../src/logger'
import { evlog, useLogger } from '../../src/elysia/index'
import {
  assertDrainCalledWith,
  assertEnrichBeforeDrain,
  assertHttpEventEmitted,
  assertSensitiveHeadersFiltered,
  createPipelineSpies,
  findEventViaDrain,
  waitForDrainCalls,
} from '../helpers/framework'
import { defined, getDrainCallArg } from '../helpers/defined'

function delay(ms = 1) {
  return new Promise((resolve) => {
    setImmediate(resolve)
  })
}

function request(app: { handle: (req: Request) => Promise<Response> }, path: string, init?: RequestInit) {
  return app.handle(new Request(`http://localhost${path}`, init)).then(async (response) => {
    // using Elysia.afterResponse is scheduled to run
    // after response is sent but not immediately
    await delay()

    return response
  })
}

describe('evlog/elysia', () => {
  beforeEach(() => {
    initLogger({
      env: { service: 'elysia-test' },
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

  it('creates a logger accessible via context', async () => {
    let hasLogger = false

    const app = new Elysia()
      .use(evlog())
      .get('/api/test', ({ log }) => {
        hasLogger = log !== undefined && typeof log.set === 'function'
        return { ok: true }
      })

    await request(app, '/api/test')
    expect(hasLogger).toBe(true)
  })

  it('emits event with correct method, path, and status', async () => {
    const { drain } = createPipelineSpies()
    const app = new Elysia()
      .use(evlog({ drain }))
      .get('/api/users', () => ({ users: [] }))

    await request(app, '/api/users')
    await waitForDrainCalls(drain)

    const event = assertHttpEventEmitted(drain, {
      path: '/api/users',
      method: 'GET',
      status: 200,
      level: 'info',
    })
    expect(event.duration).toBeDefined()
  })

  it('emits event with correct status when using Elysia.status', async () => {
    const { drain } = createPipelineSpies()
    const app = new Elysia()
      .use(evlog({ drain }))
      .get('/api/users', ({ status }) => status(422, ({ users: [] })))

    await request(app, '/api/users')
    await waitForDrainCalls(drain)

    const event = assertHttpEventEmitted(drain, {
      path: '/api/users',
      method: 'GET',
      status: 422,
      level: 'info',
    })
    expect(event.duration).toBeDefined()
  })

  it('accumulates context set by route handler', async () => {
    const { drain } = createPipelineSpies()
    const app = new Elysia()
      .use(evlog({ drain }))
      .get('/api/users', () => {
        useLogger().set({ user: { id: 'u-1' }, db: { queries: 3 } })
        return { users: [] }
      })

    await request(app, '/api/users')
    await waitForDrainCalls(drain)

    const event = defined(
      findEventViaDrain(drain, e => e.path === '/api/users'),
      'accumulated context event',
    )
    expect(event.user).toEqual({ id: 'u-1' })
    expect(event.db).toEqual({ queries: 3 })
  })

  it('logs error context when handler throws', async () => {
    const { drain } = createPipelineSpies()
    const app = new Elysia()
      .use(evlog({ drain }))
      .get('/api/fail', () => {
        throw new Error('Something broke')
      })

    await request(app, '/api/fail')
    await waitForDrainCalls(drain)

    assertHttpEventEmitted(drain, {
      path: '/api/fail',
      level: 'error',
    })
  })

  it('skips routes not matching include patterns', async () => {
    const { drain } = createPipelineSpies()

    const app = new Elysia()
      .use(evlog({ include: ['/api/**'], drain }))
      .get('/health', () => ({ ok: true }))

    await request(app, '/health')
    expect(drain).not.toHaveBeenCalled()
  })

  it('logs routes matching include patterns', async () => {
    const { drain } = createPipelineSpies()
    const app = new Elysia()
      .use(evlog({ include: ['/api/**'], drain }))
      .get('/api/data', () => {
        useLogger().set({ data: true })
        return { ok: true }
      })

    await request(app, '/api/data')
    await waitForDrainCalls(drain)

    expect(findEventViaDrain(drain, e => e.path === '/api/data')).toBeDefined()
  })

  it('uses x-request-id header when present', async () => {
    const { drain } = createPipelineSpies()
    const app = new Elysia()
      .use(evlog({ drain }))
      .get('/api/test', () => ({ ok: true }))

    await request(app, '/api/test', {
      headers: { 'x-request-id': 'custom-req-id' },
    })
    await waitForDrainCalls(drain)

    const event = defined(
      findEventViaDrain(drain, e => e.path === '/api/test'),
      'event with x-request-id',
    )
    expect(event.requestId).toBe('custom-req-id')
  })

  it('handles POST requests with correct method', async () => {
    const { drain } = createPipelineSpies()
    const app = new Elysia()
      .use(evlog({ drain }))
      .post('/api/checkout', () => ({ ok: true }))

    await request(app, '/api/checkout', { method: 'POST' })
    await waitForDrainCalls(drain)

    assertHttpEventEmitted(drain, { path: '/api/checkout', method: 'POST' })
  })

  it('excludes routes matching exclude patterns', async () => {
    const { drain } = createPipelineSpies()

    const app = new Elysia()
      .use(evlog({ exclude: ['/_internal/**'], drain }))
      .get('/_internal/probe', () => ({ ok: true }))

    await request(app, '/_internal/probe')
    expect(drain).not.toHaveBeenCalled()
  })

  it('applies route-based service override', async () => {
    const { drain } = createPipelineSpies()
    const app = new Elysia()
      .use(evlog({
        routes: { '/api/auth/**': { service: 'auth-service' } },
        drain,
      }))
      .get('/api/auth/login', () => ({ ok: true }))

    await request(app, '/api/auth/login')
    await waitForDrainCalls(drain)

    const event = defined(
      findEventViaDrain(drain, e => e.path === '/api/auth/login'),
      'route service override event',
    )
    expect(event.service).toBe('auth-service')
  })

  describe('drain / enrich / keep', () => {
    it('calls drain with emitted event (shared helpers)', async () => {
      const { drain } = createPipelineSpies()

      const app = new Elysia()
        .use(evlog({ drain }))
        .get('/api/test', () => {
          useLogger().set({ user: { id: 'u-1' } })
          return { ok: true }
        })

      await request(app, '/api/test')

      assertDrainCalledWith(drain, { path: '/api/test', method: 'GET', level: 'info', status: 200 })
      const [[ctx]] = drain.mock.calls
      expect(ctx.headers).toBeDefined()
    })

    it('calls enrich before drain (shared helpers)', async () => {
      const { drain, enrich } = createPipelineSpies()
      enrich.mockImplementation((ctx) => {
        ctx.event.enriched = true
      })

      const app = new Elysia()
        .use(evlog({ enrich, drain }))
        .get('/api/test', () => ({ ok: true }))

      await request(app, '/api/test')

      assertEnrichBeforeDrain(enrich, drain)
      expect(drain.mock.calls[0][0].event.enriched).toBe(true)
    })

    it('enrich receives response status and safe headers', async () => {
      const { enrich } = createPipelineSpies()

      const app = new Elysia()
        .use(evlog({ enrich }))
        .get('/api/test', () => ({ ok: true }))

      await request(app, '/api/test', {
        headers: { 'user-agent': 'test-bot/1.0', 'x-custom': 'value' },
      })

      expect(enrich).toHaveBeenCalledOnce()
      const ctx = defined(enrich.mock.calls[0]?.[0], 'enrich context')
      expect(ctx.response?.status).toBe(200)
      expect(ctx.headers?.['user-agent']).toBe('test-bot/1.0')
      expect(ctx.headers?.['x-custom']).toBe('value')
    })

    it('filters sensitive headers (shared helpers)', async () => {
      const { drain } = createPipelineSpies()

      const app = new Elysia()
        .use(evlog({ drain }))
        .get('/api/test', () => ({ ok: true }))

      await request(app, '/api/test', {
        headers: {
          'authorization': 'Bearer secret-token',
          'cookie': 'session=abc',
          'x-safe': 'visible',
        },
      })

      const ctx = getDrainCallArg(defined(drain.mock.calls[0], 'drain call'))
      assertSensitiveHeadersFiltered(ctx)
      expect(ctx.headers?.['x-safe']).toBe('visible')
    })

    it('calls keep callback for tail sampling', async () => {
      const { keep, drain } = createPipelineSpies()
      keep.mockImplementation((ctx) => {
        if (ctx.context.important) ctx.shouldKeep = true
      })

      const app = new Elysia()
        .use(evlog({ keep, drain }))
        .get('/api/test', () => {
          useLogger().set({ important: true })
          return { ok: true }
        })

      await request(app, '/api/test')

      expect(keep).toHaveBeenCalledOnce()
      expect(keep.mock.calls[0][0].path).toBe('/api/test')
      expect(drain).toHaveBeenCalledOnce()
    })

    it('calls drain on error responses', async () => {
      const { drain } = createPipelineSpies()

      const app = new Elysia()
        .use(evlog({ drain }))
        .get('/api/fail', () => {
          throw new Error('something broke')
        })

      await request(app, '/api/fail')

      assertDrainCalledWith(drain, { path: '/api/fail', level: 'error' })
    })

    it('drain error does not break request', async () => {
      const drain = vi.fn(() => {
        throw new Error('drain exploded')
      })

      const app = new Elysia()
        .use(evlog({ drain }))
        .get('/api/test', () => ({ ok: true }))

      const res = await request(app, '/api/test')
      expect(res.status).toBe(200)
      expect(drain).toHaveBeenCalledOnce()
    })

    it('enrich error does not prevent drain', async () => {
      const { drain } = createPipelineSpies()
      const enrich = vi.fn(() => {
        throw new Error('enrich exploded')
      })

      const app = new Elysia()
        .use(evlog({ enrich, drain }))
        .get('/api/test', () => ({ ok: true }))

      const res = await request(app, '/api/test')
      expect(res.status).toBe(200)
      expect(enrich).toHaveBeenCalledOnce()
      expect(drain).toHaveBeenCalledOnce()
    })

    it('does not call drain/enrich when route is skipped', async () => {
      const { drain, enrich } = createPipelineSpies()

      const app = new Elysia()
        .use(evlog({ include: ['/api/**'], drain, enrich }))
        .get('/health', () => ({ ok: true }))

      await request(app, '/health')

      expect(drain).not.toHaveBeenCalled()
      expect(enrich).not.toHaveBeenCalled()
    })
  })

  describe('useLogger()', () => {
    it('throws outside middleware context', () => {
      expect(() => useLogger()).toThrow('[evlog] useLogger()')
    })

    it('returns same logger as context log', async () => {
      let same = false

      const app = new Elysia()
        .use(evlog())
        .get('/api/test', ({ log }) => {
          const fromUseLogger = useLogger()
          same = fromUseLogger === log
          return { ok: true }
        })

      await request(app, '/api/test')
      expect(same).toBe(true)
    })

    it('works across async boundaries', async () => {
      const { drain } = createPipelineSpies()

      function serviceFunction() {
        useLogger().set({ fromService: true })
      }

      const app = new Elysia()
        .use(evlog({ drain }))
        .get('/api/test', async () => {
          await serviceFunction()
          return { ok: true }
        })

      await request(app, '/api/test')
      await waitForDrainCalls(drain)

      expect(findEventViaDrain(drain, e => e.fromService === true)).toBeDefined()
    })
  })
})
