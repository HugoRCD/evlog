import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Elysia } from 'elysia'
import { initLogger } from '../src/logger'
import { evlog, useLogger } from '../src/elysia/index'
import {
  assertDrainCalledWith,
  assertEnrichBeforeDrain,
  assertSensitiveHeadersFiltered,
  createPipelineSpies,
} from './helpers/framework'

function request(app: Elysia, path: string, init?: RequestInit) {
  return app.handle(new Request(`http://localhost${path}`, init))
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
    const app = new Elysia()
      .use(evlog())
      .get('/api/users', () => ({ users: [] }))

    const consoleSpy = vi.mocked(console.info)
    await request(app, '/api/users')

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
    const app = new Elysia()
      .use(evlog())
      .get('/api/users', ({ log }) => {
        log.set({ user: { id: 'u-1' }, db: { queries: 3 } })
        return { users: [] }
      })

    const consoleSpy = vi.mocked(console.info)
    await request(app, '/api/users')

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"user"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.user.id).toBe('u-1')
    expect(event.db.queries).toBe(3)
  })

  it('logs error context when handler throws', async () => {
    const app = new Elysia()
      .use(evlog())
      .get('/api/fail', () => {
        throw new Error('Something broke')
      })

    const errorSpy = vi.mocked(console.error)
    await request(app, '/api/fail')

    const lastCall = errorSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"path":"/api/fail"'),
    )
    expect(lastCall).toBeDefined()

    const event = JSON.parse(lastCall![0] as string)
    expect(event.path).toBe('/api/fail')
    expect(event.level).toBe('error')
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
    const app = new Elysia()
      .use(evlog({ include: ['/api/**'] }))
      .get('/api/data', ({ log }) => {
        log.set({ data: true })
        return { ok: true }
      })

    const consoleSpy = vi.mocked(console.info)
    await request(app, '/api/data')

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"path":"/api/data"'),
    )
    expect(lastCall).toBeDefined()
  })

  it('uses x-request-id header when present', async () => {
    const app = new Elysia()
      .use(evlog())
      .get('/api/test', () => ({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await request(app, '/api/test', {
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
    const app = new Elysia()
      .use(evlog())
      .post('/api/checkout', () => ({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await request(app, '/api/checkout', { method: 'POST' })

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"method":"POST"'),
    )
    expect(lastCall).toBeDefined()
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
    const app = new Elysia()
      .use(evlog({
        routes: { '/api/auth/**': { service: 'auth-service' } },
      }))
      .get('/api/auth/login', () => ({ ok: true }))

    const consoleSpy = vi.mocked(console.info)
    await request(app, '/api/auth/login')

    const lastCall = consoleSpy.mock.calls.find(call =>
      typeof call[0] === 'string' && call[0].includes('"service":"auth-service"'),
    )
    expect(lastCall).toBeDefined()
  })

  describe('drain / enrich / keep', () => {
    it('calls drain with emitted event (shared helpers)', async () => {
      const { drain } = createPipelineSpies()

      const app = new Elysia()
        .use(evlog({ drain }))
        .get('/api/test', ({ log }) => {
          log.set({ user: { id: 'u-1' } })
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
      const [[ctx]] = enrich.mock.calls
      expect(ctx.response!.status).toBe(200)
      expect(ctx.headers!['user-agent']).toBe('test-bot/1.0')
      expect(ctx.headers!['x-custom']).toBe('value')
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

      assertSensitiveHeadersFiltered(drain.mock.calls[0][0])
      expect(drain.mock.calls[0][0].headers!['x-safe']).toBe('visible')
    })

    it('calls keep callback for tail sampling', async () => {
      const { keep, drain } = createPipelineSpies()
      keep.mockImplementation((ctx) => {
        if (ctx.context.important) ctx.shouldKeep = true
      })

      const app = new Elysia()
        .use(evlog({ keep, drain }))
        .get('/api/test', ({ log }) => {
          log.set({ important: true })
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

    it('throws outside middleware context', () => {
      expect(() => useLogger()).toThrow('[evlog] useLogger()')
    })

    it('works across async boundaries', async () => {
      let captured = false

      function serviceFunction() {
        const log = useLogger()
        log.set({ fromService: true })
        captured = true
      }

      const app = new Elysia()
        .use(evlog())
        .get('/api/test', async () => {
          await serviceFunction()
          return { ok: true }
        })

      const consoleSpy = vi.mocked(console.info)
      await request(app, '/api/test')

      expect(captured).toBe(true)
      const lastCall = consoleSpy.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('"fromService":true'),
      )
      expect(lastCall).toBeDefined()
    })
  })
})
