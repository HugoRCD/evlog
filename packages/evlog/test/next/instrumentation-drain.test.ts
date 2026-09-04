import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Controls how the mocked `next/server` `after()` behaves per test.
 *
 * - 'collect': record registered callbacks so tests can flush them manually
 *   (simulates Next running after() work once the response/prerender is done).
 * - 'throw': after() throws synchronously, as it does outside a request scope.
 * - 'missing': `after` is undefined, as on older Next versions.
 */
const afterState = vi.hoisted(() => ({
  mode: 'collect' as 'collect' | 'throw' | 'missing',
  callbacks: [] as Array<() => void>,
  calls: 0,
}))

vi.mock('next/server', () => ({
  get after() {
    if (afterState.mode === 'missing') {
      return undefined
    }
    return (task: () => unknown): void => {
      afterState.calls++
      if (afterState.mode === 'throw') {
        throw new Error('`after` was called outside a request scope')
      }
      afterState.callbacks.push(() => task())
    }
  },
}))

describe('createInstrumentation global drain lifecycle', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    afterState.mode = 'collect'
    afterState.callbacks = []
    afterState.calls = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function loadModule() {
    vi.resetModules()
    return import('../../src/next/instrumentation-create')
  }

  async function registerWithDrain(drain: (ctx: { event: { message?: string } }) => void | Promise<void>) {
    const { createInstrumentation } = await loadModule()
    const instrumentation = createInstrumentation({
      service: 'test',
      silent: true,
      drain: drain as never,
    })
    await instrumentation.register()
    const { log } = await import('../../src/logger')
    return log
  }

  it('defers the global drain through Next after() instead of starting it in the emitting context', async () => {
    const drain = vi.fn()
    const log = await registerWithDrain(drain)

    log.info({ message: 'rendered during prerender' })

    // The drain must not start inside the emitting async context: during a
    // Cache Components prerender pass, a fetch started there is rejected with
    // HANGING_PROMISE_REJECTION when the prerender completes.
    expect(drain).not.toHaveBeenCalled()
    expect(afterState.calls).toBe(1)

    // Next runs after() callbacks once the render is complete.
    for (const callback of afterState.callbacks.splice(0)) {
      callback()
    }
    await vi.waitFor(() => {
      expect(drain).toHaveBeenCalledTimes(1)
    })
    expect(drain.mock.calls[0]?.[0]?.event.message).toBe('rendered during prerender')
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('still delivers the event when after() throws outside a request scope', async () => {
    afterState.mode = 'throw'
    const drain = vi.fn()
    const log = await registerWithDrain(drain)

    log.info({ message: 'boot log' })

    await vi.waitFor(() => {
      expect(drain).toHaveBeenCalledTimes(1)
    })
    expect(drain.mock.calls[0]?.[0]?.event.message).toBe('boot log')
  })

  it('still delivers the event when after() is unavailable', async () => {
    afterState.mode = 'missing'
    const drain = vi.fn()
    const log = await registerWithDrain(drain)

    log.info({ message: 'legacy next' })

    await vi.waitFor(() => {
      expect(drain).toHaveBeenCalledTimes(1)
    })
    expect(drain.mock.calls[0]?.[0]?.event.message).toBe('legacy next')
  })
})
