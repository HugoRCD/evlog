import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { initLogger } from '../../src/logger'
import { evlog, type EvlogVariables } from '../../src/hono/index'
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

describe('evlog/hono', () => {
  beforeEach(() => {
    initLogger({
      env: { service: 'hono-test' },
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

  it('creates a logger accessible via c.get("log")', async () => {
    const app = new Hono<EvlogVariables>()
    app.use(evlog())

    let hasLogger = false
    app.get('/api/test', (c) => {
      const log = c.get('log')
      hasLogger = log !== undefined && typeof log.set === 'function'
      return c.json({ ok: true })
    })

    await app.request('/api/test')
    expect(hasLogger).toBe(true)
  })

  it('emits event with correct method, path, and status', async () => {
    const { drain } = createPipelineSpies()
    const app = new Hono<EvlogVariables>()
    app.use(evlog({ drain }))
    app.get('/api/users', (c) => c.json({ users: [] }))

    await app.request('/api/users')
    await waitForDrainCalls(drain)

    const event = assertHttpEventEmitted(drain, {
      path: '/api/users',
      method: 'GET',
      status: 200,
      level: 'info',
    })
    expect(event.duration).toBeDefined()
  })

  it('accumulates context set by route handler', async () => {
    const { drain } = createPipelineSpies()
    const app = new Hono<EvlogVariables>()
    app.use(evlog({ drain }))
    app.get('/api/users', (c) => {
      c.get('log').set({ user: { id: 'u-1' }, db: { queries: 3 } })
      return c.json({ users: [] })
    })

    await app.request('/api/users')
    await waitForDrainCalls(drain)

    const event = defined(
      findEventViaDrain(drain, e => e.path === '/api/users'),
      'accumulated context event',
    )
    expect(event.user).toEqual({ id: 'u-1' })
    expect(event.db).toEqual({ queries: 3 })
  })

  it('logs status 500 when handler throws and Hono handles the error', async () => {
    const { drain } = createPipelineSpies()
    const app = new Hono<EvlogVariables>()
    app.use(evlog({ drain }))
    app.get('/api/fail', () => {
      throw new Error('Something broke')
    })

    await app.request('/api/fail')
    await waitForDrainCalls(drain)

    assertHttpEventEmitted(drain, { path: '/api/fail', status: 500 })
  })

  it('logs error context set manually by route handler', async () => {
    const { drain } = createPipelineSpies()
    const app = new Hono<EvlogVariables>()
    app.use(evlog({ drain }))
    app.get('/api/fail', (c) => {
      const log = c.get('log')
      log.error(new Error('Manual error'))
      return c.json({ error: 'handled' }, 500)
    })

    await app.request('/api/fail')
    await waitForDrainCalls(drain)

    assertHttpEventEmitted(drain, { path: '/api/fail', level: 'error', status: 500 })
  })

  it('skips routes not matching include patterns', async () => {
    const app = new Hono<EvlogVariables>()
    app.use(evlog({ include: ['/api/**'] }))

    let logValue: unknown = 'untouched'
    app.get('/health', (c) => {
      try {
        logValue = c.get('log') 
      } catch {
        logValue = undefined 
      }
      return c.json({ ok: true })
    })

    await app.request('/health')
    expect(logValue).toBeUndefined()
  })

  it('logs routes matching include patterns', async () => {
    const { drain } = createPipelineSpies()
    const app = new Hono<EvlogVariables>()
    app.use(evlog({ include: ['/api/**'], drain }))
    app.get('/api/data', (c) => {
      c.get('log').set({ data: true })
      return c.json({ ok: true })
    })

    await app.request('/api/data')
    await waitForDrainCalls(drain)

    expect(findEventViaDrain(drain, e => e.path === '/api/data')).toBeDefined()
  })

  it('uses x-request-id header when present', async () => {
    const { drain } = createPipelineSpies()
    const app = new Hono<EvlogVariables>()
    app.use(evlog({ drain }))
    app.get('/api/test', (c) => c.json({ ok: true }))

    await app.request('/api/test', {
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
    const app = new Hono<EvlogVariables>()
    app.use(evlog({ drain }))
    app.post('/api/checkout', (c) => c.json({ ok: true }))

    await app.request('/api/checkout', { method: 'POST' })
    await waitForDrainCalls(drain)

    assertHttpEventEmitted(drain, { path: '/api/checkout', method: 'POST' })
  })

  it('excludes routes matching exclude patterns', async () => {
    const app = new Hono<EvlogVariables>()
    app.use(evlog({ exclude: ['/_internal/**'] }))

    let logValue: unknown = 'untouched'
    app.get('/_internal/probe', (c) => {
      try {
        logValue = c.get('log') 
      } catch {
        logValue = undefined 
      }
      return c.json({ ok: true })
    })

    await app.request('/_internal/probe')
    expect(logValue).toBeUndefined()
  })

  it('applies route-based service override', async () => {
    const { drain } = createPipelineSpies()
    const app = new Hono<EvlogVariables>()
    app.use(evlog({
      routes: { '/api/auth/**': { service: 'auth-service' } },
      drain,
    }))
    app.get('/api/auth/login', (c) => c.json({ ok: true }))

    await app.request('/api/auth/login')
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

      const app = new Hono<EvlogVariables>()
      app.use(evlog({ drain }))
      app.get('/api/test', (c) => {
        c.get('log').set({ user: { id: 'u-1' } })
        return c.json({ ok: true })
      })

      await app.request('/api/test')

      assertDrainCalledWith(drain, { path: '/api/test', method: 'GET', level: 'info', status: 200 })
      const [[ctx]] = drain.mock.calls
      expect(ctx.headers).toBeDefined()
    })

    it('calls enrich before drain (shared helpers)', async () => {
      const { drain, enrich } = createPipelineSpies()
      enrich.mockImplementation((ctx) => {
        ctx.event.enriched = true 
      })

      const app = new Hono<EvlogVariables>()
      app.use(evlog({ enrich, drain }))
      app.get('/api/test', (c) => c.json({ ok: true }))

      await app.request('/api/test')

      assertEnrichBeforeDrain(enrich, drain)
      expect(drain.mock.calls[0][0].event.enriched).toBe(true)
    })

    it('enrich receives response status and safe headers', async () => {
      const { enrich } = createPipelineSpies()

      const app = new Hono<EvlogVariables>()
      app.use(evlog({ enrich }))
      app.get('/api/test', (c) => c.json({ ok: true }))

      await app.request('/api/test', {
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

      const app = new Hono<EvlogVariables>()
      app.use(evlog({ drain }))
      app.get('/api/test', (c) => c.json({ ok: true }))

      await app.request('/api/test', {
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

      const app = new Hono<EvlogVariables>()
      app.use(evlog({ keep, drain }))
      app.get('/api/test', (c) => {
        c.get('log').set({ important: true })
        return c.json({ ok: true })
      })

      await app.request('/api/test')

      expect(keep).toHaveBeenCalledOnce()
      expect(keep.mock.calls[0][0].path).toBe('/api/test')
      expect(drain).toHaveBeenCalledOnce()
    })

    it('calls drain on error responses', async () => {
      const { drain } = createPipelineSpies()

      const app = new Hono<EvlogVariables>()
      app.use(evlog({ drain }))
      app.get('/api/fail', (c) => {
        c.get('log').error(new Error('something broke'))
        return c.json({ error: 'fail' }, 500)
      })

      await app.request('/api/fail')

      assertDrainCalledWith(drain, { path: '/api/fail', level: 'error', status: 500 })
    })

    it('drain error does not break request', async () => {
      const drain = vi.fn(() => {
        throw new Error('drain exploded') 
      })

      const app = new Hono<EvlogVariables>()
      app.use(evlog({ drain }))
      app.get('/api/test', (c) => c.json({ ok: true }))

      const res = await app.request('/api/test')
      expect(res.status).toBe(200)
      expect(drain).toHaveBeenCalledOnce()
    })

    it('enrich error does not prevent drain', async () => {
      const { drain } = createPipelineSpies()
      const enrich = vi.fn(() => {
        throw new Error('enrich exploded') 
      })

      const app = new Hono<EvlogVariables>()
      app.use(evlog({ enrich, drain }))
      app.get('/api/test', (c) => c.json({ ok: true }))

      const res = await app.request('/api/test')
      expect(res.status).toBe(200)
      expect(enrich).toHaveBeenCalledOnce()
      expect(drain).toHaveBeenCalledOnce()
    })

    it('does not call drain/enrich when route is skipped', async () => {
      const { drain, enrich } = createPipelineSpies()

      const app = new Hono<EvlogVariables>()
      app.use(evlog({ include: ['/api/**'], drain, enrich }))
      app.get('/health', (c) => c.json({ ok: true }))

      await app.request('/health')

      expect(drain).not.toHaveBeenCalled()
      expect(enrich).not.toHaveBeenCalled()
    })
  })
})
