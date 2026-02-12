import type { DrainContext } from './types'
import type { DrainPipelineOptions, PipelineDrainFn } from './pipeline'
import { createDrainPipeline } from './pipeline'

export interface BrowserDrainOptions {
  /** Backend proxy URL to send batched logs to */
  endpoint: string

  /** Batching options forwarded to the drain pipeline */
  batch?: {
    /** Maximum number of events per batch. @default 25 */
    size?: number
    /** Maximum time (ms) before flushing a partial batch. @default 2000 */
    intervalMs?: number
  }

  /** Retry options forwarded to the drain pipeline */
  retry?: DrainPipelineOptions['retry']

  /** Maximum number of events held in the buffer. @default 1000 */
  maxBufferSize?: number

  /** Called when a batch is dropped after all retries are exhausted, or when the buffer overflows. */
  onDropped?: (events: DrainContext[], error?: Error) => void

  /** Extra headers to include in fetch requests (not used with sendBeacon). */
  headers?: Record<string, string>
}

/**
 * Create a browser-compatible drain that sends batched log events to a backend proxy endpoint.
 *
 * Uses `fetch` with `keepalive: true` for normal operation, and falls back to
 * `navigator.sendBeacon` when the page is being hidden (e.g. tab close, navigation).
 *
 * Automatically flushes buffered events on `visibilitychange` (page hide).
 *
 * Returns a `PipelineDrainFn<DrainContext>` — fully compatible with `initLogger({ drain })`.
 *
 * @example
 * ```ts
 * import { initLogger, log } from 'evlog'
 * import { createBrowserDrain } from 'evlog/browser'
 *
 * const drain = createBrowserDrain({ endpoint: '/api/logs' })
 *
 * initLogger({
 *   env: { service: 'my-app' },
 *   drain,
 * })
 *
 * log.info({ action: 'checkout', items: 3 })
 *
 * // Flush remaining events (e.g. before SPA navigation)
 * await drain.flush()
 * ```
 */
export function createBrowserDrain(options: BrowserDrainOptions): PipelineDrainFn<DrainContext> {
  const { endpoint, headers: customHeaders } = options

  async function send(batch: DrainContext[]): Promise<void> {
    if (batch.length === 0) return

    const events = batch.map(ctx => ctx.event)
    const body = JSON.stringify(events)

    // Use sendBeacon when the page is being hidden (tab close, navigation)
    // sendBeacon is more reliable than fetch during page unload
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden'
      && typeof navigator?.sendBeacon === 'function') {
      const queued = navigator.sendBeacon(endpoint, body)
      if (!queued) {
        throw new Error(`[evlog/browser] sendBeacon failed for ${endpoint}`)
      }
      return
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...customHeaders,
      },
      body,
      keepalive: true,
    })

    if (!response.ok) {
      throw new Error(`[evlog/browser] proxy error: ${response.status} ${response.statusText}`)
    }
  }

  const pipeline = createDrainPipeline<DrainContext>({
    batch: {
      size: options.batch?.size ?? 25,
      intervalMs: options.batch?.intervalMs ?? 2000,
    },
    retry: options.retry ?? { maxAttempts: 2 },
    maxBufferSize: options.maxBufferSize,
    onDropped: options.onDropped,
  })

  const drain = pipeline(send)

  // Auto-flush when the page is being hidden to avoid losing buffered events
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        void drain.flush()
      }
    })
  }

  return drain
}
