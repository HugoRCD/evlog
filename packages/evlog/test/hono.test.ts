import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { initLogger } from '../src/logger'
import { evlog, type EvlogVariables } from '../src/hono/index'
import {
  assertDrainCalledWith,
  assertEnrichBeforeDrain,
  assertSensitiveHeadersFiltered,
  createPipelineSpies,
} from './helpers/framework'

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
    const app = new Hono<EvlogVariables>()
    app.use(evlog())
    app.get('/api/users', (c) => c.json({ users: [] }))

    const consoleSpy = vi.mocked(console.info)
    await app.request('/api/users')

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
    const app = new Hono<EvlogVariables>()
    app.use(evlog())
    app.get('/api/users', (c) => {
      c.get('log').set({ user: { id: 'u-1' }, db: { queries: 3 } })
      return c.json({ users: [] })
    })

    const consoleSpy = vi.mocked(console.info)
    await app.request('/api/users')

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"user"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.user.id).toBe('u-1')
    expect(event.db.queries).toBe(3)
  })

  it('logs status 500 when handler throws and Hono handles the error', async () => {
    const app = new Hono<EvlogVariables>()
    app.use(evlog())
    app.get('/api/fail', () => {
      throw new Error('Something broke')
    })

    const infoSpy = vi.mocked(console.info)
    await app.request('/api/fail')

    const lastCall = infoSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"path":"/api/fail"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.status).toBe(500)
    expect(event.path).toBe('/api/fail')
  })

  it('logs error context set manually by route handler', async () => {
    const app = new Hono<EvlogVariables>()
    app.use(evlog())
    app.get('/api/fail', (c) => {
      const log = c.get('log')
      log.error(new Error('Manual error'))
      return c.json({ error: 'handled' }, 500)
    })

    const errorSpy = vi.mocked(console.error)
    await app.request('/api/fail')

    const lastCall = errorSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"level":"error"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.level).toBe('error')
    expect(event.status).toBe(500)
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
    const app = new Hono<EvlogVariables>()
    app.use(evlog({ include: ['/api/**'] }))
    app.get('/api/data', (c) => {
      c.get('log').set({ data: true })
      return c.json({ ok: true })
    })

    const consoleSpy = vi.mocked(console.info)
    await app.request('/api/data')

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"path":"/api/data"'),
    )
    expect(lastCall).toBeDefined()
  })

  it('uses x-request-id header when present', async () => {
    const app = new Hono<EvlogVariables>()
    app.use(evlog())
    app.get('/api/test', (c) => c.json({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await app.request('/api/test', {
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
    const app = new Hono<EvlogVariables>()
    app.use(evlog())
    app.post('/api/checkout', (c) => c.json({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await app.request('/api/checkout', { method: 'POST' })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"method":"POST"'),
    )
    expect(lastCall).toBeDefined()
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
    const app = new Hono<EvlogVariables>()
    app.use(evlog({
      routes: { '/api/auth/**': { service: 'auth-service' } },
    }))
    app.get('/api/auth/login', (c) => c.json({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await app.request('/api/auth/login')

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"service":"auth-service"'),
    )
    expect(lastCall).toBeDefined()
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
      const ctx = drain.mock.calls[0][0]
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
      const ctx = enrich.mock.calls[0][0]
      expect(ctx.response!.status).toBe(200)
      expect(ctx.headers!['user-agent']).toBe('test-bot/1.0')
      expect(ctx.headers!['x-custom']).toBe('value')
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

      assertSensitiveHeadersFiltered(drain.mock.calls[0][0])
      expect(drain.mock.calls[0][0].headers!['x-safe']).toBe('visible')
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
