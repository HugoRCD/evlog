export interface DrainPipelineOptions<T = unknown> {
  batch?: {
    /** Maximum number of events per batch sent to the drain function. @default 50 */
    size?: number
    /** Maximum time (ms) an event can stay buffered before a flush is triggered, even if the batch is not full. @default 5000 */
    intervalMs?: number
  }
  retry?: {
    /** Total number of attempts (including the initial one) before dropping the batch. @default 3 */
    maxAttempts?: number
    /** Delay strategy between retry attempts. @default 'exponential' */
    backoff?: 'exponential' | 'linear' | 'fixed'
    /** Base delay (ms) for the first retry. Scaled by the backoff strategy on subsequent retries. @default 1000 */
    initialDelayMs?: number
    /** Upper bound (ms) for any single retry delay. @default 30000 */
    maxDelayMs?: number
  }
  /** Maximum number of events held in the buffer. When exceeded, the oldest event is dropped. @default 1000 */
  maxBufferSize?: number
  /** Called when a batch is dropped after all retry attempts are exhausted, or when the buffer overflows. */
  onDropped?: (events: T[], error?: Error) => void
}

export interface PipelineDrainFn<T> {
  (ctx: T): void
  /** Flush all buffered events. Call on server shutdown. */
  flush: () => Promise<void>
  readonly pending: number
}

/**
 * Create a drain pipeline that batches events, retries on failure, and manages buffer overflow.
 *
 * Returns a higher-order function: pass your drain adapter to get a hook-compatible function.
 *
 * @example
 * ```ts
 * const pipeline = createDrainPipeline({ batch: { size: 50 } })
 * const drain = pipeline(async (batch) => {
 *   await sendToBackend(batch)
 * })
 *
 * // Use as a hook
 * nitroApp.hooks.hook('evlog:drain', drain)
 *
 * // Flush on shutdown
 * nitroApp.hooks.hook('close', () => drain.flush())
 * ```
 */
export function createDrainPipeline<T = unknown>(options?: DrainPipelineOptions<T>): (drain: (batch: T[]) => void | Promise<void>) => PipelineDrainFn<T> {
  const batchSize = options?.batch?.size ?? 50
  const intervalMs = options?.batch?.intervalMs ?? 5000
  const maxBufferSize = options?.maxBufferSize ?? 1000
  const maxAttempts = options?.retry?.maxAttempts ?? 3
  const backoffStrategy = options?.retry?.backoff ?? 'exponential'
  const initialDelayMs = options?.retry?.initialDelayMs ?? 1000
  const maxDelayMs = options?.retry?.maxDelayMs ?? 30000
  const onDropped = options?.onDropped

  return (drain: (batch: T[]) => void | Promise<void>): PipelineDrainFn<T> => {
    const buffer: T[] = []
    let timer: ReturnType<typeof setTimeout> | null = null
    let activeFlush: Promise<void> | null = null

    function clearTimer(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }

    function scheduleFlush(): void {
      if (timer !== null || activeFlush) return
      timer = setTimeout(() => {
        timer = null
        if (!activeFlush) startFlush()
      }, intervalMs)
    }

    function getRetryDelay(attempt: number): number {
      let delay: number
      switch (backoffStrategy) {
        case 'linear':
          delay = initialDelayMs * attempt
          break
        case 'fixed':
          delay = initialDelayMs
          break
        case 'exponential':
        default:
          delay = initialDelayMs * 2 ** (attempt - 1)
          break
      }
      return Math.min(delay, maxDelayMs)
    }

    async function sendWithRetry(batch: T[]): Promise<void> {
      let lastError: Error | undefined
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await drain(batch)
          return
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          if (attempt < maxAttempts) {
            await new Promise<void>(r => setTimeout(r, getRetryDelay(attempt)))
          }
        }
      }
      onDropped?.(batch, lastError)
    }

    async function drainBuffer(): Promise<void> {
      while (buffer.length > 0) {
        const batch = buffer.splice(0, batchSize)
        await sendWithRetry(batch)
      }
    }

    function startFlush(): void {
      if (activeFlush) return
      activeFlush = drainBuffer().finally(() => {
        activeFlush = null
        if (buffer.length >= batchSize) {
          startFlush()
        } else if (buffer.length > 0) {
          scheduleFlush()
        }
      })
    }

    function push(ctx: T): void {
      if (buffer.length >= maxBufferSize) {
        const dropped = buffer.splice(0, 1)
        onDropped?.(dropped)
      }
      buffer.push(ctx)

      if (buffer.length >= batchSize) {
        clearTimer()
        startFlush()
      } else if (!activeFlush) {
        scheduleFlush()
      }
    }

    async function flush(): Promise<void> {
      clearTimer()
      if (activeFlush) {
        await activeFlush
      }
      await drainBuffer()
    }

    const hookFn = push as PipelineDrainFn<T>
    hookFn.flush = flush
    Object.defineProperty(hookFn, 'pending', {
      get: () => buffer.length,
      enumerable: true,
    })

    return hookFn
  }
}
