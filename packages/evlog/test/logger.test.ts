import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequestLogger, getEnvironment, initLoggerSync, log } from '../src/logger'

describe('initLoggerSync', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('initializes with default values', () => {
    initLoggerSync()
    const env = getEnvironment()

    expect(env.service).toBe('app')
    expect(env.environment).toBeDefined()
  })

  it('uses custom config values', () => {
    initLoggerSync({
      env: {
        service: 'my-api',
        environment: 'staging',
        version: '1.2.3',
      },
    })

    const env = getEnvironment()

    expect(env.service).toBe('my-api')
    expect(env.environment).toBe('staging')
    expect(env.version).toBe('1.2.3')
  })

  it('reads from environment variables', () => {
    vi.stubEnv('SERVICE_NAME', 'env-service')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_VERSION', '2.0.0')

    initLoggerSync()
    const env = getEnvironment()

    expect(env.service).toBe('env-service')
    expect(env.environment).toBe('production')
    expect(env.version).toBe('2.0.0')
  })

  it('prefers config over env vars', () => {
    vi.stubEnv('SERVICE_NAME', 'env-service')

    initLoggerSync({
      env: { service: 'config-service' },
    })

    const env = getEnvironment()
    expect(env.service).toBe('config-service')
  })
})

describe('log', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    initLoggerSync({ pretty: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs tagged message with info level', () => {
    log.info('auth', 'User logged in')
    expect(consoleSpy).toHaveBeenCalled()
    const output = consoleSpy.mock.calls[0][0]
    expect(output).toContain('"level":"info"')
    expect(output).toContain('"tag":"auth"')
    expect(output).toContain('"message":"User logged in"')
  })

  it('logs wide event object', () => {
    log.info({ action: 'checkout', items: 3 })
    expect(consoleSpy).toHaveBeenCalled()
    const output = consoleSpy.mock.calls[0][0]
    expect(output).toContain('"action":"checkout"')
    expect(output).toContain('"items":3')
  })

  it('uses error console method for error level', () => {
    const errorSpy = vi.spyOn(console, 'error')
    log.error('db', 'Connection failed')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('uses warn console method for warn level', () => {
    const warnSpy = vi.spyOn(console, 'warn')
    log.warn('cache', 'Cache miss')
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('createRequestLogger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    initLoggerSync({ pretty: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates logger with request context', () => {
    const logger = createRequestLogger({
      method: 'POST',
      path: '/api/checkout',
      requestId: 'req-123',
    })

    const context = logger.getContext()
    expect(context.method).toBe('POST')
    expect(context.path).toBe('/api/checkout')
    expect(context.requestId).toBe('req-123')
  })

  it('accumulates context with set()', () => {
    const logger = createRequestLogger({ method: 'GET', path: '/api/user' })

    logger.set({ user: { id: '123' } })
    logger.set({ cart: { items: 3 } })

    const context = logger.getContext()
    expect(context.user).toEqual({ id: '123' })
    expect(context.cart).toEqual({ items: 3 })
  })

  it('overwrites existing keys with set()', () => {
    const logger = createRequestLogger({})

    logger.set({ status: 'pending' })
    logger.set({ status: 'complete' })

    const context = logger.getContext()
    expect(context.status).toBe('complete')
  })

  it('records error with error()', () => {
    const logger = createRequestLogger({})
    const error = new Error('Payment failed')

    logger.error(error, { step: 'payment' })

    const context = logger.getContext()
    expect(context.error).toEqual({
      name: 'Error',
      message: 'Payment failed',
      stack: expect.any(String),
    })
    expect(context.step).toBe('payment')
  })

  it('accepts string error', () => {
    const logger = createRequestLogger({})
    logger.error('Something went wrong')

    const context = logger.getContext()
    expect(context.error).toEqual({
      name: 'Error',
      message: 'Something went wrong',
      stack: expect.any(String),
    })
  })

  it('emits wide event on emit()', () => {
    const logger = createRequestLogger({
      method: 'GET',
      path: '/api/test',
    })

    logger.set({ user: { id: '123' } })
    logger.emit()

    expect(consoleSpy).toHaveBeenCalled()
    const output = consoleSpy.mock.calls[0][0]
    expect(output).toContain('"level":"info"')
    expect(output).toContain('"method":"GET"')
    expect(output).toContain('"path":"/api/test"')
    expect(output).toContain('"duration"')
  })

  it('emits error level when error recorded', () => {
    const errorSpy = vi.spyOn(console, 'error')
    const logger = createRequestLogger({})

    logger.error(new Error('Failed'))
    logger.emit()

    expect(errorSpy).toHaveBeenCalled()
    const output = errorSpy.mock.calls[0]?.[0]
    expect(output).toContain('"level":"error"')
  })

  it('includes duration in emitted event', async () => {
    const logger = createRequestLogger({})

    await new Promise(resolve => setTimeout(resolve, 50))
    logger.emit()

    const output = consoleSpy.mock.calls[0][0]
    expect(output).toMatch(/"duration":"[0-9]+ms"/)
  })

  it('allows overrides on emit()', () => {
    const logger = createRequestLogger({})
    logger.set({ original: true })
    logger.emit({ override: true })

    const output = consoleSpy.mock.calls[0][0]
    expect(output).toContain('"original":true')
    expect(output).toContain('"override":true')
  })
})
