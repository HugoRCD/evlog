let flushHandler: (() => Promise<void>) | undefined
let listenersInstalled = false

/**
 * Extract a flush function from a pipeline drain (objects with `.flush()`).
 */
export function resolveFlushFn(drain: unknown): (() => Promise<void>) | undefined {
  if (typeof drain !== 'function') return undefined
  const candidate = drain as { flush?: () => Promise<void> }
  if (typeof candidate.flush !== 'function') return undefined
  return () => candidate.flush!()
}

/**
 * Register process hooks that flush buffered drain events before exit.
 *
 * SIGINT/SIGTERM: flush, then re-emit the signal so the shell keeps default behaviour.
 */
export function installFlushOnExit(flush: () => Promise<void>): void {
  if (listenersInstalled) return
  listenersInstalled = true
  flushHandler = flush

  const runFlush = () => {
    if (!flushHandler) return
    void flushHandler().catch(err => console.error('[evlog/cli] flush failed:', err))
  }

  process.on('beforeExit', runFlush)

  const handleSignal = (signal: NodeJS.Signals) => {
    process.on(signal, () => {
      const handler = flushHandler
      if (!handler) {
        process.kill(process.pid, signal)
        return
      }
      void handler()
        .catch(err => console.error('[evlog/cli] flush failed:', err))
        .finally(() => process.kill(process.pid, signal))
    })
  }

  handleSignal('SIGINT')
  handleSignal('SIGTERM')
}

/** @internal Reset flush hooks between tests. */
export function resetFlushOnExitForTests(): void {
  flushHandler = undefined
  listenersInstalled = false
}
