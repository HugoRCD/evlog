let flushHandler: (() => Promise<void>) | undefined
let listenersInstalled = false
let beforeExitHandler: (() => void) | undefined
type SignalHandler = () => void
const signalHandlers = new Map<NodeJS.Signals, SignalHandler>()

/**
 * Extract a flush function from a pipeline drain (functions or objects with `.flush()`).
 */
export function resolveFlushFn(drain: unknown): (() => Promise<void>) | undefined {
  if (drain === null || drain === undefined) return undefined

  const candidate = drain as { flush?: () => Promise<void> }
  if (typeof candidate.flush !== 'function') return undefined

  return () => candidate.flush!()
}

function createSignalHandler(signal: NodeJS.Signals): () => void {
  return () => {
    const handlerFn = flushHandler
    if (!handlerFn) {
      process.kill(process.pid, signal)
      return
    }
    void handlerFn()
      .catch(err => console.error('[evlog/cli] flush failed:', err))
      .finally(() => process.kill(process.pid, signal))
  }
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

  beforeExitHandler = runFlush
  process.on('beforeExit', beforeExitHandler)

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    const handler = createSignalHandler(signal)
    signalHandlers.set(signal, handler)
    process.once(signal, handler)
  }
}

/** @internal Reset flush hooks between tests. */
export function resetFlushOnExitForTests(): void {
  if (beforeExitHandler) {
    process.removeListener('beforeExit', beforeExitHandler)
    beforeExitHandler = undefined
  }
  for (const [signal, handler] of signalHandlers) {
    process.removeListener(signal, handler)
  }
  signalHandlers.clear()
  flushHandler = undefined
  listenersInstalled = false
}
