import { vi } from 'vitest'

/**
 * Run `fn` with `vi.useFakeTimers()` enabled and restore real timers
 * afterwards. Lets tests advance the clock deterministically (`vi.advanceTimersByTime`)
 * without leaking fake timers into surrounding tests.
 *
 * @example
 * ```ts
 * await withFakeTimers(async () => {
 *   const start = logger.start()
 *   vi.advanceTimersByTime(100)
 *   await start.finish()
 *   expect(drain).toHaveBeenCalled()
 * })
 * ```
 */
export async function withFakeTimers<T>(fn: () => T | Promise<T>): Promise<T> {
  vi.useFakeTimers()
  try {
    return await fn()
  } finally {
    vi.useRealTimers()
  }
}

/**
 * Flush queued microtasks. Cheaper and more deterministic than
 * `await new Promise(r => setTimeout(r, 0))` for tests that just need
 * pending promises to settle.
 */
export async function flushMicrotasks(times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}
