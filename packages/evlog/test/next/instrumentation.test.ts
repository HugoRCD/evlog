import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock next/server to prevent import errors
vi.mock('next/server', () => ({ after: undefined }))

// Spy on initLogger to verify register() calls it correctly
const initLoggerSpy = vi.fn()
vi.mock('../../src/logger', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/logger')>()
  return {
    ...mod,
    initLogger: (...args: unknown[]) => {
      initLoggerSpy(...args)
      return mod.initLogger(...(args as Parameters<typeof mod.initLogger>))
    },
  }
})

describe('createInstrumentation', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let originalStdoutWrite: typeof process.stdout.write
  let originalStderrWrite: typeof process.stderr.write
  let originalNextRuntime: string | undefined

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    originalStdoutWrite = process.stdout.write
    originalStderrWrite = process.stderr.write
    originalNextRuntime = process.env.NEXT_RUNTIME
    initLoggerSpy.mockClear()
  })

  afterEach(() => {
    process.stdout.write = originalStdoutWrite
    process.stderr.write = originalStderrWrite
    if (originalNextRuntime === undefined) {
      delete process.env.NEXT_RUNTIME
    } else {
      process.env.NEXT_RUNTIME = originalNextRuntime
    }
    vi.restoreAllMocks()
    // Reset module state between tests so `registered` flag is fresh
    vi.resetModules()
  })

  async function loadModule() {
    const mod = await import('../../src/next/instrumentation')
    return mod.createInstrumentation
  }

  it('register() calls initLogger() with correct config', async () => {
    const createInstrumentation = await loadModule()
    const drainMock = vi.fn()
    const { register } = createInstrumentation({
      service: 'my-app',
      pretty: false,
      silent: true,
      drain: drainMock,
      sampling: { rates: { info: 50 } },
      stringify: false,
    })

    register()

    expect(initLoggerSpy).toHaveBeenCalledTimes(1)
    const [[config]] = initLoggerSpy.mock.calls
    expect(config.env.service).toBe('my-app')
    expect(config.pretty).toBe(false)
    expect(config.silent).toBe(true)
    expect(config.drain).toBe(drainMock)
    expect(config.sampling).toEqual({ rates: { info: 50 } })
    expect(config.stringify).toBe(false)
  })

  it('register() with captureOutput patches stdout and stderr', async () => {
    const createInstrumentation = await loadModule()
    process.env.NEXT_RUNTIME = 'nodejs'

    const { register } = createInstrumentation({
      captureOutput: true,
      pretty: false,
    })

    register()

    expect(process.stdout.write).not.toBe(originalStdoutWrite)
    expect(process.stderr.write).not.toBe(originalStderrWrite)
  })

  it('register() without captureOutput does NOT patch stdout/stderr', async () => {
    const createInstrumentation = await loadModule()
    process.env.NEXT_RUNTIME = 'nodejs'

    const { register } = createInstrumentation({ pretty: false })

    register()

    expect(process.stdout.write).toBe(originalStdoutWrite)
    expect(process.stderr.write).toBe(originalStderrWrite)
  })

  it('edge runtime safety: no patching when NEXT_RUNTIME is not nodejs', async () => {
    const createInstrumentation = await loadModule()
    process.env.NEXT_RUNTIME = 'edge'

    const { register } = createInstrumentation({
      captureOutput: true,
      pretty: false,
    })

    register()

    expect(process.stdout.write).toBe(originalStdoutWrite)
    expect(process.stderr.write).toBe(originalStderrWrite)
  })

  it('onRequestError() emits structured event with correct fields', async () => {
    const createInstrumentation = await loadModule()
    const drainMock = vi.fn()
    const { register, onRequestError } = createInstrumentation({
      pretty: false,
      drain: drainMock,
    })

    register()

    const error = Object.assign(new Error('Something broke'), { digest: 'abc123' })
    const request = { path: '/api/checkout', method: 'POST', headers: {} }
    const context = {
      routerKind: 'App Router',
      routePath: '/api/checkout',
      routeType: 'route',
      renderSource: 'react-server-components',
    }

    onRequestError(error, request, context)

    expect(consoleErrorSpy).toHaveBeenCalled()
    const [[output]] = consoleErrorSpy.mock.calls
    const parsed = JSON.parse(output)

    expect(parsed.level).toBe('error')
    expect(parsed.message).toBe('Something broke')
    expect(parsed.digest).toBe('abc123')
    expect(parsed.stack).toBeDefined()
    expect(parsed.path).toBe('/api/checkout')
    expect(parsed.method).toBe('POST')
    expect(parsed.routerKind).toBe('App Router')
    expect(parsed.routePath).toBe('/api/checkout')
    expect(parsed.routeType).toBe('route')
    expect(parsed.renderSource).toBe('react-server-components')
  })

  it('events go through drain', async () => {
    const createInstrumentation = await loadModule()
    const drainMock = vi.fn()
    const { register, onRequestError } = createInstrumentation({
      pretty: false,
      drain: drainMock,
    })

    register()

    const error = Object.assign(new Error('fail'), { digest: 'x' })
    onRequestError(error, { path: '/test', method: 'GET', headers: {} }, {
      routerKind: 'App Router',
      routePath: '/test',
      routeType: 'page',
      renderSource: 'react-server-components',
    })

    // Drain is called fire-and-forget via Promise.resolve().catch()
    // Give it a tick to resolve
    await vi.waitFor(() => expect(drainMock).toHaveBeenCalledTimes(1))

    const [[drainCtx]] = drainMock.mock.calls
    expect(drainCtx.event).toBeDefined()
    expect(drainCtx.event.message).toBe('fail')
  })

  it('re-entrancy guard prevents infinite recursion', async () => {
    const createInstrumentation = await loadModule()
    process.env.NEXT_RUNTIME = 'nodejs'

    const { register } = createInstrumentation({
      captureOutput: true,
      pretty: true,
    })

    register()

    // This should NOT cause infinite recursion:
    // stdout.write -> log.info -> pretty print -> console.log -> stdout.write -> GUARD stops
    expect(() => {
      process.stdout.write('trigger\n')
    }).not.toThrow()
  })

  it('register() is idempotent — second call is a no-op', async () => {
    const createInstrumentation = await loadModule()
    const { register } = createInstrumentation({ pretty: false })
    register()
    register()
    expect(initLoggerSpy).toHaveBeenCalledTimes(1)
  })

  it('createInstrumentation() with enabled: false', async () => {
    const createInstrumentation = await loadModule()
    const { register, onRequestError } = createInstrumentation({
      enabled: false,
      pretty: false,
    })

    register()

    expect(initLoggerSpy).toHaveBeenCalledTimes(1)
    const [[config]] = initLoggerSpy.mock.calls
    expect(config.enabled).toBe(false)

    const error = Object.assign(new Error('fail'), { digest: 'x' })
    onRequestError(error, { path: '/test', method: 'GET', headers: {} }, {
      routerKind: 'App Router',
      routePath: '/test',
      routeType: 'route',
      renderSource: 'react-server-components',
    })

    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('createInstrumentation() with default options', async () => {
    const createInstrumentation = await loadModule()
    const { register } = createInstrumentation()
    expect(() => register()).not.toThrow()
    expect(initLoggerSpy).toHaveBeenCalledTimes(1)
  })

  it('onRequestError() with undefined digest', async () => {
    const createInstrumentation = await loadModule()
    const { register, onRequestError } = createInstrumentation({ pretty: false })

    register()

    const error = new Error('fail') as { digest?: string } & Error
    onRequestError(error, { path: '/test', method: 'GET', headers: {} }, {
      routerKind: 'App Router',
      routePath: '/test',
      routeType: 'route',
      renderSource: 'react-server-components',
    })

    expect(consoleErrorSpy).toHaveBeenCalled()
    const [[output]] = consoleErrorSpy.mock.calls
    const parsed = JSON.parse(output)
    expect(parsed.digest).toBeUndefined()
  })

  it('captureOutput with NEXT_RUNTIME undefined', async () => {
    const createInstrumentation = await loadModule()
    delete process.env.NEXT_RUNTIME

    const { register } = createInstrumentation({
      captureOutput: true,
      pretty: false,
    })

    register()

    expect(process.stdout.write).toBe(originalStdoutWrite)
    expect(process.stderr.write).toBe(originalStderrWrite)
  })
})
