import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initLogger } from '../src/logger'
import { createMiddlewareLogger } from '../src/shared/middleware'

describe('createMiddlewareLogger', () => {
  beforeEach(() => {
    initLogger({
      env: { service: 'test-app' },
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

  it('creates a logger with method, path, and requestId', () => {
    const { logger, skipped } = createMiddlewareLogger({
      method: 'GET',
      path: '/api/users',
      requestId: 'req-123',
    })

    expect(skipped).toBe(false)
    const ctx = logger.getContext()
    expect(ctx.method).toBe('GET')
    expect(ctx.path).toBe('/api/users')
    expect(ctx.requestId).toBe('req-123')
  })

  it('generates a requestId when not provided', () => {
    const { logger } = createMiddlewareLogger({
      method: 'GET',
      path: '/api/users',
    })

    const ctx = logger.getContext()
    expect(ctx.requestId).toBeDefined()
    expect(typeof ctx.requestId).toBe('string')
  })

  it('skips when path does not match include patterns', () => {
    const { skipped, logger } = createMiddlewareLogger({
      method: 'GET',
      path: '/health',
      include: ['/api/**'],
    })

    expect(skipped).toBe(true)
    expect(logger.getContext()).toEqual({})
  })

  it('skips when path matches exclude patterns', () => {
    const { skipped } = createMiddlewareLogger({
      method: 'GET',
      path: '/_internal/probe',
      exclude: ['/_internal/**'],
    })

    expect(skipped).toBe(true)
  })

  it('does not skip when path matches include patterns', () => {
    const { skipped } = createMiddlewareLogger({
      method: 'GET',
      path: '/api/users',
      include: ['/api/**'],
    })

    expect(skipped).toBe(false)
  })

  it('applies route-based service override', () => {
    const { logger } = createMiddlewareLogger({
      method: 'GET',
      path: '/api/auth/login',
      routes: {
        '/api/auth/**': { service: 'auth-service' },
      },
    })

    const ctx = logger.getContext()
    expect(ctx.service).toBe('auth-service')
  })

  it('finish() emits event with status', async () => {
    const { logger, finish } = createMiddlewareLogger({
      method: 'POST',
      path: '/api/checkout',
      requestId: 'req-456',
    })

    logger.set({ cart: { items: 3 } })
    const event = await finish({ status: 200 })

    expect(event).not.toBeNull()
    expect(event!.status).toBe(200)
    expect(event!.method).toBe('POST')
    expect(event!.path).toBe('/api/checkout')
    expect(event!.duration).toBeDefined()
    expect(event!.level).toBe('info')
  })

  it('finish() with error captures error and sets error status', async () => {
    const { finish } = createMiddlewareLogger({
      method: 'GET',
      path: '/api/fail',
      requestId: 'req-789',
    })

    const error = Object.assign(new Error('Payment failed'), { status: 402 })
    const event = await finish({ error })

    expect(event).not.toBeNull()
    expect(event!.status).toBe(402)
    expect(event!.level).toBe('error')
    expect(event!.error).toBeDefined()
    expect((event!.error as Record<string, unknown>).message).toBe('Payment failed')
  })

  it('finish() with error defaults to status 500', async () => {
    const { finish } = createMiddlewareLogger({
      method: 'GET',
      path: '/api/fail',
    })

    const event = await finish({ error: new Error('crash') })

    expect(event).not.toBeNull()
    expect(event!.status).toBe(500)
  })

  it('finish() calls keep callback for tail sampling', async () => {
    const keep = vi.fn((ctx: { shouldKeep?: boolean }) => {
      ctx.shouldKeep = true
    })

    const { finish } = createMiddlewareLogger({
      method: 'GET',
      path: '/api/important',
      keep,
    })

    await finish({ status: 200 })

    expect(keep).toHaveBeenCalledOnce()
    expect(keep).toHaveBeenCalledWith(expect.objectContaining({
      status: 200,
      path: '/api/important',
      method: 'GET',
      duration: expect.any(Number),
    }))
  })

  it('returns noop when logging is disabled', () => {
    initLogger({ enabled: false })

    const { skipped, logger } = createMiddlewareLogger({
      method: 'GET',
      path: '/api/users',
    })

    expect(skipped).toBe(true)
    expect(logger.getContext()).toEqual({})
  })

  it('finish() on skipped logger returns null', async () => {
    const { finish, skipped } = createMiddlewareLogger({
      method: 'GET',
      path: '/health',
      include: ['/api/**'],
    })

    expect(skipped).toBe(true)
    const event = await finish({ status: 200 })
    expect(event).toBeNull()
  })

  it('accumulates context before finish', async () => {
    const { logger, finish } = createMiddlewareLogger({
      method: 'GET',
      path: '/api/users',
    })

    logger.set({ user: { id: 'u-1' } })
    logger.set({ db: { queries: 3 } })

    const event = await finish({ status: 200 })

    expect(event).not.toBeNull()
    expect((event!.user as Record<string, unknown>).id).toBe('u-1')
    expect((event!.db as Record<string, unknown>).queries).toBe(3)
  })

  it('finish() includes duration', async () => {
    const { finish } = createMiddlewareLogger({
      method: 'GET',
      path: '/api/slow',
    })

    const event = await finish({ status: 200 })

    expect(event).not.toBeNull()
    expect(event!.duration).toBeDefined()
    expect(typeof event!.duration).toBe('string')
  })

  it('finish() with warn level when logger has warnings', async () => {
    const { logger, finish } = createMiddlewareLogger({
      method: 'GET',
      path: '/api/warn',
    })

    logger.warn('Deprecated endpoint')
    const event = await finish({ status: 200 })

    expect(event).not.toBeNull()
    expect(event!.level).toBe('warn')
  })

  describe('built-in drain/enrich pipeline', () => {
    it('calls drain with emitted event and request info', async () => {
      const drain = vi.fn()

      const { logger, finish } = createMiddlewareLogger({
        method: 'POST',
        path: '/api/checkout',
        requestId: 'req-d1',
        headers: { 'user-agent': 'test-bot' },
        drain,
      })

      logger.set({ cart: { total: 99 } })
      await finish({ status: 200 })

      expect(drain).toHaveBeenCalledOnce()
      const ctx = drain.mock.calls[0][0]
      expect(ctx.event.path).toBe('/api/checkout')
      expect(ctx.event.cart.total).toBe(99)
      expect(ctx.request).toEqual({ method: 'POST', path: '/api/checkout', requestId: 'req-d1' })
      expect(ctx.headers['user-agent']).toBe('test-bot')
    })

    it('calls enrich before drain and allows event mutation', async () => {
      const callOrder: string[] = []
      const enrich = vi.fn((ctx) => {
        callOrder.push('enrich')
        ctx.event.enriched = true
      })
      const drain = vi.fn((ctx) => {
        callOrder.push('drain')
        expect(ctx.event.enriched).toBe(true)
      })

      const { finish } = createMiddlewareLogger({
        method: 'GET',
        path: '/api/test',
        enrich,
        drain,
      })

      await finish({ status: 200 })

      expect(callOrder).toEqual(['enrich', 'drain'])
    })

    it('enrich receives response status and headers', async () => {
      const enrich = vi.fn()

      const { finish } = createMiddlewareLogger({
        method: 'GET',
        path: '/api/test',
        headers: { 'x-custom': 'value' },
        enrich,
      })

      await finish({ status: 201 })

      expect(enrich).toHaveBeenCalledOnce()
      const ctx = enrich.mock.calls[0][0]
      expect(ctx.response.status).toBe(201)
      expect(ctx.headers['x-custom']).toBe('value')
    })

    it('drain error does not throw', async () => {
      const drain = vi.fn(() => { throw new Error('drain exploded') })

      const { finish } = createMiddlewareLogger({
        method: 'GET',
        path: '/api/test',
        drain,
      })

      await expect(finish({ status: 200 })).resolves.not.toBeNull()
    })

    it('enrich error does not prevent drain', async () => {
      const drain = vi.fn()
      const enrich = vi.fn(() => { throw new Error('enrich exploded') })

      const { finish } = createMiddlewareLogger({
        method: 'GET',
        path: '/api/test',
        enrich,
        drain,
      })

      await finish({ status: 200 })

      expect(drain).toHaveBeenCalledOnce()
    })

    it('does not call drain/enrich when route is skipped', async () => {
      const drain = vi.fn()
      const enrich = vi.fn()

      const { finish, skipped } = createMiddlewareLogger({
        method: 'GET',
        path: '/health',
        include: ['/api/**'],
        drain,
        enrich,
      })

      expect(skipped).toBe(true)
      await finish({ status: 200 })

      expect(drain).not.toHaveBeenCalled()
      expect(enrich).not.toHaveBeenCalled()
    })

    it('calls drain on error with correct status', async () => {
      const drain = vi.fn()

      const { finish } = createMiddlewareLogger({
        method: 'GET',
        path: '/api/fail',
        drain,
      })

      const error = Object.assign(new Error('fail'), { status: 422 })
      await finish({ error })

      expect(drain).toHaveBeenCalledOnce()
      const ctx = drain.mock.calls[0][0]
      expect(ctx.event.status).toBe(422)
      expect(ctx.event.level).toBe('error')
    })

    it('works with keep + drain + enrich together', async () => {
      const keep = vi.fn((ctx) => { ctx.shouldKeep = true })
      const enrich = vi.fn((ctx) => { ctx.event.region = 'eu' })
      const drain = vi.fn()

      const { logger, finish } = createMiddlewareLogger({
        method: 'GET',
        path: '/api/important',
        keep,
        enrich,
        drain,
      })

      logger.set({ important: true })
      const event = await finish({ status: 200 })

      expect(keep).toHaveBeenCalledOnce()
      expect(enrich).toHaveBeenCalledOnce()
      expect(drain).toHaveBeenCalledOnce()
      expect(event).not.toBeNull()
      expect(drain.mock.calls[0][0].event.region).toBe('eu')
    })
  })
})
