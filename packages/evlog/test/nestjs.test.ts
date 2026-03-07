import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { initLogger } from '../src/logger'
import { evlog, useLogger } from '../src/nestjs/index'
import {
  assertDrainCalledWith,
  assertEnrichBeforeDrain,
  assertSensitiveHeadersFiltered,
  createPipelineSpies,
} from './helpers/framework'

// NestJS uses Express under the hood by default.
// We test the evlog/nestjs middleware with Express to validate it works correctly.
describe('evlog/nestjs', () => {
  beforeEach(() => {
    initLogger({
      env: { service: 'nestjs-test' },
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

  it('creates a logger accessible via req.log', async () => {
    const app = express()
    app.use(evlog())

    let hasLogger = false
    app.get('/api/test', (req, res) => {
      hasLogger = req.log !== undefined && typeof req.log.set === 'function'
      res.json({ ok: true })
    })

    await request(app).get('/api/test')
    expect(hasLogger).toBe(true)
  })

  it('emits event with correct method, path, and status', async () => {
    const app = express()
    app.use(evlog())
    app.get('/api/users', (_req, res) => res.json({ users: [] }))

    const consoleSpy = vi.mocked(console.info)
    await request(app).get('/api/users')

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
    const app = express()
    app.use(evlog())
    app.get('/api/users', (req, res) => {
      req.log.set({ user: { id: 'u-1' }, db: { queries: 3 } })
      res.json({ users: [] })
    })

    const consoleSpy = vi.mocked(console.info)
    await request(app).get('/api/users')

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"user"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.user.id).toBe('u-1')
    expect(event.db.queries).toBe(3)
  })

  it('logs error status when handler sends error response', async () => {
    const app = express()
    app.use(evlog())
    app.get('/api/fail', (req, res) => {
      req.log.error(new Error('Something broke'))
      res.status(500).json({ error: 'fail' })
    })

    const errorSpy = vi.mocked(console.error)
    await request(app).get('/api/fail')

    const lastCall = errorSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"level":"error"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.level).toBe('error')
    expect(event.status).toBe(500)
  })

  it('skips routes not matching include patterns', async () => {
    const app = express()
    app.use(evlog({ include: ['/api/**'] }))

    let logValue: unknown = 'untouched'
    app.get('/health', (req, res) => {
      logValue = req.log
      res.json({ ok: true })
    })

    await request(app).get('/health')
    expect(logValue).toBeUndefined()
  })

  it('logs routes matching include patterns', async () => {
    const app = express()
    app.use(evlog({ include: ['/api/**'] }))
    app.get('/api/data', (req, res) => {
      req.log.set({ data: true })
      res.json({ ok: true })
    })

    const consoleSpy = vi.mocked(console.info)
    await request(app).get('/api/data')

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"path":"/api/data"'),
    )
    expect(lastCall).toBeDefined()
  })

  it('uses x-request-id header when present', async () => {
    const app = express()
    app.use(evlog())
    app.get('/api/test', (_req, res) => res.json({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await request(app).get('/api/test').set('x-request-id', 'custom-req-id')

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('custom-req-id'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.requestId).toBe('custom-req-id')
  })

  it('handles POST requests with correct method', async () => {
    const app = express()
    app.use(evlog())
    app.post('/api/checkout', (_req, res) => res.json({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await request(app).post('/api/checkout')

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"method":"POST"'),
    )
    expect(lastCall).toBeDefined()
  })

  it('excludes routes matching exclude patterns', async () => {
    const app = express()
    app.use(evlog({ exclude: ['/_internal/**'] }))

    let logValue: unknown = 'untouched'
    app.get('/_internal/probe', (req, res) => {
      logValue = req.log
      res.json({ ok: true })
    })

    await request(app).get('/_internal/probe')
    expect(logValue).toBeUndefined()
  })

  it('applies route-based service override', async () => {
    const app = express()
    app.use(evlog({
      routes: { '/api/auth/**': { service: 'auth-service' } },
    }))
    app.get('/api/auth/login', (_req, res) => res.json({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await request(app).get('/api/auth/login')

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"service":"auth-service"'),
    )
    expect(lastCall).toBeDefined()
  })

  describe('drain / enrich / keep', () => {
    it('calls drain with emitted event (shared helpers)', async () => {
      const { drain } = createPipelineSpies()

      const app = express()
      app.use(evlog({ drain }))
      app.get('/api/test', (req, res) => {
        req.log.set({ user: { id: 'u-1' } })
        res.json({ ok: true })
      })

      await request(app).get('/api/test')

      assertDrainCalledWith(drain, { path: '/api/test', method: 'GET', level: 'info', status: 200 })
      const [[ctx]] = drain.mock.calls
      expect(ctx.headers).toBeDefined()
    })

    it('calls enrich before drain (shared helpers)', async () => {
      const { drain, enrich } = createPipelineSpies()
      enrich.mockImplementation((ctx) => {
        ctx.event.enriched = true
      })

      const app = express()
      app.use(evlog({ enrich, drain }))
      app.get('/api/test', (_req, res) => res.json({ ok: true }))

      await request(app).get('/api/test')

      assertEnrichBeforeDrain(enrich, drain)
      expect(drain.mock.calls[0][0].event.enriched).toBe(true)
    })

    it('enrich receives response status and safe headers', async () => {
      const { enrich } = createPipelineSpies()

      const app = express()
      app.use(evlog({ enrich }))
      app.get('/api/test', (_req, res) => res.json({ ok: true }))

      await request(app)
        .get('/api/test')
        .set('user-agent', 'test-bot/1.0')
        .set('x-custom', 'value')

      expect(enrich).toHaveBeenCalledOnce()
      const [[ctx]] = enrich.mock.calls
      expect(ctx.response!.status).toBe(200)
      expect(ctx.headers!['user-agent']).toBe('test-bot/1.0')
      expect(ctx.headers!['x-custom']).toBe('value')
    })

    it('filters sensitive headers (shared helpers)', async () => {
      const { drain } = createPipelineSpies()

      const app = express()
      app.use(evlog({ drain }))
      app.get('/api/test', (_req, res) => res.json({ ok: true }))

      await request(app)
        .get('/api/test')
        .set('authorization', 'Bearer secret-token')
        .set('cookie', 'session=abc')
        .set('x-safe', 'visible')

      assertSensitiveHeadersFiltered(drain.mock.calls[0][0])
      expect(drain.mock.calls[0][0].headers!['x-safe']).toBe('visible')
    })

    it('calls keep callback for tail sampling', async () => {
      const { keep, drain } = createPipelineSpies()
      keep.mockImplementation((ctx) => {
        if (ctx.context.important) ctx.shouldKeep = true
      })

      const app = express()
      app.use(evlog({ keep, drain }))
      app.get('/api/test', (req, res) => {
        req.log.set({ important: true })
        res.json({ ok: true })
      })

      await request(app).get('/api/test')

      expect(keep).toHaveBeenCalledOnce()
      expect(keep.mock.calls[0][0].path).toBe('/api/test')
      expect(drain).toHaveBeenCalledOnce()
    })

    it('drain error does not break request', async () => {
      const drain = vi.fn(() => {
        throw new Error('drain exploded')
      })

      const app = express()
      app.use(evlog({ drain }))
      app.get('/api/test', (_req, res) => res.json({ ok: true }))

      const res = await request(app).get('/api/test')
      expect(res.status).toBe(200)
      expect(drain).toHaveBeenCalledOnce()
    })

    it('enrich error does not prevent drain', async () => {
      const { drain } = createPipelineSpies()
      const enrich = vi.fn(() => {
        throw new Error('enrich exploded')
      })

      const app = express()
      app.use(evlog({ enrich, drain }))
      app.get('/api/test', (_req, res) => res.json({ ok: true }))

      const res = await request(app).get('/api/test')
      expect(res.status).toBe(200)
      expect(enrich).toHaveBeenCalledOnce()
      expect(drain).toHaveBeenCalledOnce()
    })

    it('does not call drain/enrich when route is skipped', async () => {
      const { drain, enrich } = createPipelineSpies()

      const app = express()
      app.use(evlog({ include: ['/api/**'], drain, enrich }))
      app.get('/health', (_req, res) => res.json({ ok: true }))

      await request(app).get('/health')

      expect(drain).not.toHaveBeenCalled()
      expect(enrich).not.toHaveBeenCalled()
    })
  })

  describe('useLogger()', () => {
    it('returns the request-scoped logger from anywhere in the call stack', async () => {
      const app = express()
      app.use(evlog())

      let loggerFromService: unknown
      function serviceFunction() {
        loggerFromService = useLogger()
        useLogger().set({ fromService: true })
      }

      app.get('/api/test', (_req, res) => {
        serviceFunction()
        res.json({ ok: true })
      })

      const consoleSpy = vi.mocked(console.info)
      await request(app).get('/api/test')

      expect(loggerFromService).toBeDefined()
      expect(typeof (loggerFromService as Record<string, unknown>).set).toBe('function')

      const lastCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"fromService":true'),
      )
      expect(lastCall).toBeDefined()
    })

    it('returns the same logger as req.log', async () => {
      const app = express()
      app.use(evlog())

      let isSame = false
      app.get('/api/test', (req, res) => {
        isSame = useLogger() === req.log
        res.json({ ok: true })
      })

      await request(app).get('/api/test')
      expect(isSame).toBe(true)
    })

    it('throws when called outside middleware context', () => {
      expect(() => useLogger()).toThrow('[evlog] useLogger()')
    })

    it('works across async boundaries', async () => {
      const app = express()
      app.use(evlog())

      async function asyncService() {
        await new Promise(resolve => setTimeout(resolve, 5))
        useLogger().set({ asyncWork: 'done' })
      }

      app.get('/api/test', async (_req, res) => {
        await asyncService()
        res.json({ ok: true })
      })

      const consoleSpy = vi.mocked(console.info)
      await request(app).get('/api/test')

      const lastCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"asyncWork":"done"'),
      )
      expect(lastCall).toBeDefined()
    })
  })
})
