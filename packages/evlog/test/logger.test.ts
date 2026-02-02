import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequestLogger, getEnvironment, initLogger, log } from '../src/logger'

describe('initLogger', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('initializes with default values', () => {
    initLogger()
    const env = getEnvironment()

    expect(env.service).toBe('app')
    expect(env.environment).toBeDefined()
  })

  it('uses custom config values', () => {
    initLogger({
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

    initLogger()
    const env = getEnvironment()

    expect(env.service).toBe('env-service')
    expect(env.environment).toBe('production')
    expect(env.version).toBe('2.0.0')
  })

  it('prefers config over env vars', () => {
    vi.stubEnv('SERVICE_NAME', 'env-service')

    initLogger({
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
    initLogger({ pretty: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs tagged message with info level', () => {
    log.info('auth', 'User logged in')
    expect(consoleSpy).toHaveBeenCalled()
    const [[output]] = consoleSpy.mock.calls
    expect(output).toContain('"level":"info"')
    expect(output).toContain('"tag":"auth"')
    expect(output).toContain('"message":"User logged in"')
  })

  it('logs wide event object', () => {
    log.info({ action: 'checkout', items: 3 })
    expect(consoleSpy).toHaveBeenCalled()
    const [[output]] = consoleSpy.mock.calls
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
    initLogger({ pretty: false })
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

  it('overwrites existing primitive keys with set()', () => {
    const logger = createRequestLogger({})

    logger.set({ status: 'pending' })
    logger.set({ status: 'complete' })

    const context = logger.getContext()
    expect(context.status).toBe('complete')
  })

  it('deep merges nested objects with set()', () => {
    const logger = createRequestLogger({})

    logger.set({ user: { name: 'Alice' } })
    logger.set({ user: { id: '123' } })

    const context = logger.getContext()
    expect(context.user).toEqual({ name: 'Alice', id: '123' })
  })

  it('deep merges multiple levels of nesting', () => {
    const logger = createRequestLogger({})

    logger.set({ order: { customer: { name: 'Alice' } } })
    logger.set({ order: { customer: { email: 'alice@example.com' } } })
    logger.set({ order: { total: 99.99 } })

    const context = logger.getContext()
    expect(context.order).toEqual({
      customer: { name: 'Alice', email: 'alice@example.com' },
      total: 99.99,
    })
  })

  it('new values override existing values in nested objects', () => {
    const logger = createRequestLogger({})

    logger.set({ user: { status: 'pending' } })
    logger.set({ user: { status: 'active' } })

    const context = logger.getContext()
    expect(context.user).toEqual({ status: 'active' })
  })

  it('handles arrays in nested objects', () => {
    const logger = createRequestLogger({})

    logger.set({ cart: { items: ['item1'] } })
    logger.set({ cart: { total: 50 } })

    const context = logger.getContext()
    expect(context.cart).toEqual({ items: ['item1'], total: 50 })
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
    const [[output]] = consoleSpy.mock.calls
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

    const [[output]] = consoleSpy.mock.calls
    expect(output).toMatch(/"duration":"[0-9]+ms"/)
  })

  it('allows overrides on emit()', () => {
    const logger = createRequestLogger({})
    logger.set({ original: true })
    logger.emit({ override: true })

    const [[output]] = consoleSpy.mock.calls
    expect(output).toContain('"original":true')
    expect(output).toContain('"override":true')
  })

  it('returns WideEvent when log is emitted', () => {
    const logger = createRequestLogger({
      method: 'GET',
      path: '/api/test',
    })

    logger.set({ user: { id: '123' } })
    const result = logger.emit()

    expect(result).not.toBeNull()
    expect(result).toHaveProperty('timestamp')
    expect(result).toHaveProperty('level', 'info')
    expect(result).toHaveProperty('method', 'GET')
    expect(result).toHaveProperty('path', '/api/test')
    expect(result).toHaveProperty('user', { id: '123' })
  })

  it('returns null when log is sampled out', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0 },
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    const result = logger.emit()

    expect(result).toBeNull()
  })

  it('returns null when head sampling excludes the log', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.9)

    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 50 },
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    const result = logger.emit()

    expect(result).toBeNull()
    randomSpy.mockRestore()
  })
})

describe('sampling', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs everything when no sampling configured', () => {
    initLogger({ pretty: false })

    log.info('test', 'info message')
    log.warn('test', 'warn message')
    log.error('test', 'error message')

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('logs everything when sampling rates are 100%', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 100, warn: 100, debug: 100, error: 100 },
      },
    })

    log.info('test', 'info message')
    log.warn('test', 'warn message')
    log.error('test', 'error message')

    expect(consoleSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('skips all logs when sampling rate is 0%', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0, warn: 0, debug: 0, error: 0 },
      },
    })

    log.info('test', 'info message')
    log.warn('test', 'warn message')
    log.debug('test', 'debug message')
    log.error('test', 'error message')

    expect(consoleSpy).toHaveBeenCalledTimes(0)
    expect(warnSpy).toHaveBeenCalledTimes(0)
    expect(errorSpy).toHaveBeenCalledTimes(0)
  })

  it('always logs errors by default even when other levels are sampled', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0, warn: 0, debug: 0 }, // error not specified, should default to 100%
      },
    })

    log.info('test', 'info message')
    log.warn('test', 'warn message')
    log.error('test', 'error message')

    expect(consoleSpy).toHaveBeenCalledTimes(0)
    expect(warnSpy).toHaveBeenCalledTimes(0)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('applies sampling to request logger emit', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0 },
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    logger.emit()

    expect(consoleSpy).toHaveBeenCalledTimes(0)
  })

  it('respects error rate for request logger with errors', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { error: 0 }, // Explicitly set error to 0%
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    logger.error(new Error('test error'))
    logger.emit()

    expect(errorSpy).toHaveBeenCalledTimes(0)
  })

  it('samples probabilistically for rates between 0 and 100', () => {
    // Mock Math.random to control the sampling outcome
    const randomSpy = vi.spyOn(Math, 'random')

    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 50 },
      },
    })

    // Simulate random returning 0.3 (30%) - should log (30 < 50)
    randomSpy.mockReturnValueOnce(0.3)
    log.info('test', 'should log')
    expect(consoleSpy).toHaveBeenCalledTimes(1)

    // Simulate random returning 0.7 (70%) - should not log (70 >= 50)
    randomSpy.mockReturnValueOnce(0.7)
    log.info('test', 'should not log')
    expect(consoleSpy).toHaveBeenCalledTimes(1) // Still 1, not logged

    randomSpy.mockRestore()
  })

  it('applies sampling to tagged logs in pretty mode', () => {
    initLogger({
      pretty: true,
      sampling: {
        rates: { info: 0 },
      },
    })

    log.info('test', 'should not log')
    expect(consoleSpy).toHaveBeenCalledTimes(0)
  })

  it('logs tagged messages in pretty mode when sampling rate is 100%', () => {
    initLogger({
      pretty: true,
      sampling: {
        rates: { info: 100 },
      },
    })

    log.info('test', 'should log')
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })
})

describe('tail sampling', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps logs when status meets threshold', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0 }, // Would normally drop all info logs
        keep: [{ status: 400 }], // But keep if status >= 400
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    logger.set({ status: 500 }) // Error status
    logger.emit()

    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  it('does not keep logs when status is below threshold', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0 },
        keep: [{ status: 400 }],
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    logger.set({ status: 200 }) // Success status
    logger.emit()

    expect(consoleSpy).toHaveBeenCalledTimes(0)
  })

  it('keeps logs when duration meets threshold', async () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0 },
        keep: [{ duration: 50 }], // Keep if duration >= 50ms
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    await new Promise(resolve => setTimeout(resolve, 60)) // Wait longer than threshold
    logger.emit()

    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  it('does not keep logs when duration is below threshold', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0 },
        keep: [{ duration: 1000 }], // Keep if duration >= 1000ms
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    // Emit immediately (duration < 1000ms)
    logger.emit()

    expect(consoleSpy).toHaveBeenCalledTimes(0)
  })

  it('keeps logs when path matches pattern', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0 },
        keep: [{ path: '/api/critical/**' }],
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/api/critical/checkout' })
    logger.emit()

    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  it('does not keep logs when path does not match pattern', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0 },
        keep: [{ path: '/api/critical/**' }],
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/api/normal/users' })
    logger.emit()

    expect(consoleSpy).toHaveBeenCalledTimes(0)
  })

  it('uses OR logic for multiple conditions', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0 },
        keep: [
          { status: 500 }, // Keep if status >= 500
          { path: '/api/critical/**' }, // OR path matches
        ],
      },
    })

    // Only path matches, status is 200
    const logger1 = createRequestLogger({ method: 'GET', path: '/api/critical/test' })
    logger1.set({ status: 200 })
    logger1.emit()
    expect(consoleSpy).toHaveBeenCalledTimes(1)

    // Only status matches, path doesn't
    consoleSpy.mockClear()
    const logger2 = createRequestLogger({ method: 'GET', path: '/api/normal' })
    logger2.set({ status: 500 })
    logger2.emit()
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  it('force keeps logs via _forceKeep override', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 0 },
        // No keep conditions
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    logger.emit({ _forceKeep: true })

    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  it('head sampling still works when no tail conditions match', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 100 }, // Keep all info logs
        keep: [{ status: 500 }], // Tail condition won't match
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    logger.set({ status: 200 })
    logger.emit()

    // Should be logged because head sampling rate is 100%
    expect(consoleSpy).toHaveBeenCalledTimes(1)
  })

  it('combines head and tail sampling correctly', () => {
    // Mock Math.random to control head sampling
    const randomSpy = vi.spyOn(Math, 'random')

    initLogger({
      pretty: false,
      sampling: {
        rates: { info: 50 }, // 50% head sampling
        keep: [{ status: 400 }], // Always keep errors
      },
    })

    // Random returns 0.9 (would fail 50% head sampling), but status is 400
    randomSpy.mockReturnValue(0.9)
    const logger1 = createRequestLogger({ method: 'GET', path: '/test' })
    logger1.set({ status: 400 })
    logger1.emit()
    expect(consoleSpy).toHaveBeenCalledTimes(1) // Kept by tail sampling

    // Random returns 0.9 (would fail 50% head sampling), status is 200
    consoleSpy.mockClear()
    const logger2 = createRequestLogger({ method: 'GET', path: '/test' })
    logger2.set({ status: 200 })
    logger2.emit()
    expect(consoleSpy).toHaveBeenCalledTimes(0) // Dropped by head sampling

    randomSpy.mockRestore()
  })

  it('tail sampling keeps error-level logs that would be dropped by head sampling', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { error: 0 }, // Explicitly drop all error logs via head sampling
        keep: [{ status: 500 }], // But keep via tail sampling if status >= 500
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    logger.error(new Error('test error')) // Sets hasError = true, level = error
    logger.set({ status: 500 })
    logger.emit()

    // Should be logged because tail sampling rescues it (status >= 500)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('error-level logs respect head sampling when no tail conditions match', () => {
    initLogger({
      pretty: false,
      sampling: {
        rates: { error: 0 }, // Drop all error logs
        keep: [{ status: 500 }], // Only keep if status >= 500
      },
    })

    const logger = createRequestLogger({ method: 'GET', path: '/test' })
    logger.error(new Error('test error'))
    logger.set({ status: 400 }) // Status < 500, won't match tail condition
    logger.emit()

    // Should NOT be logged because head sampling drops it and tail condition doesn't match
    expect(errorSpy).toHaveBeenCalledTimes(0)
  })
})
