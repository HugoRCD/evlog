import type { DrainContext } from './types'
import type { DrainPipelineOptions, PipelineDrainFn } from './pipeline'
import { createDrainPipeline } from './pipeline'

export interface BrowserDrainConfig {
  /** URL of the server ingest endpoint */
  endpoint: string
  /** Custom headers sent with each fetch request (e.g. Authorization, X-API-Key). Not applied to sendBeacon — see `useBeacon`. */
  headers?: Record<string, string>
  /** Request timeout in milliseconds. @default 5000 */
  timeout?: number
  /** Use sendBeacon when the page is hidden. @default true */
  useBeacon?: boolean
}

export interface BrowserLogDrainOptions {
  /** Browser drain configuration (endpoint is required) */
  drain: BrowserDrainConfig
  /** Pipeline configuration overrides */
  pipeline?: DrainPipelineOptions<DrainContext>
  /** Auto-register visibilitychange flush listener. @default true */
  autoFlush?: boolean
}

/**
 * Create a low-level browser drain transport function.
 *
 * Returns a function compatible with `createDrainPipeline` that sends batches
 * to the configured endpoint via `fetch` (with `keepalive: true`) or
 * `navigator.sendBeacon` when the page is hidden.
 *
 * @example
 * ```ts
 * import { createBrowserDrain } from 'evlog/browser'
 * import { createDrainPipeline } from 'evlog/pipeline'
 *
 * const pipeline = createDrainPipeline({ batch: { size: 50 } })
 * const drain = pipeline(createBrowserDrain({ endpoint: '/api/logs' }))
 * ```
 */
export function createBrowserDrain(config: BrowserDrainConfig): (batch: DrainContext[]) => Promise<void> {
  const { endpoint, headers: customHeaders, timeout = 5000, useBeacon = true } = config

  return async (batch: DrainContext[]): Promise<void> => {
    if (batch.length === 0) return

    const body = JSON.stringify(batch)

    if (
      useBeacon
      && typeof document !== 'undefined'
      && document.visibilityState === 'hidden'
      && typeof navigator !== 'undefined'
      && typeof navigator.sendBeacon === 'function'
    ) {
      const queued = navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))
      if (!queued) {
        throw new Error('[evlog/browser] sendBeacon failed — payload may exceed browser limit')
      }
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...customHeaders },
        body,
        signal: controller.signal,
        keepalive: true,
        credentials: 'same-origin',
      })

      if (!response.ok) {
        throw new Error(`[evlog/browser] Server responded with ${response.status}`)
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Create a pre-composed browser log drain with pipeline, batching, and auto-flush.
 *
 * Returns a `PipelineDrainFn<DrainContext>` directly usable with `initLogger({ drain })`.
 *
 * @example
 * ```ts
 * import { initLogger, log } from 'evlog'
 * import { createBrowserLogDrain } from 'evlog/browser'
 *
 * const drain = createBrowserLogDrain({
 *   drain: { endpoint: '/api/logs' },
 * })
 * initLogger({ drain })
 *
 * log.info({ action: 'page_view', path: location.pathname })
 * ```
 */
export function createBrowserLogDrain(options: BrowserLogDrainOptions): PipelineDrainFn<DrainContext> & { dispose: () => void } {
  const { autoFlush = true } = options

  const pipeline = createDrainPipeline<DrainContext>({
    batch: { size: 25, intervalMs: 2000 },
    retry: { maxAttempts: 2 },
    ...options.pipeline,
  })

  const drain = pipeline(createBrowserDrain(options.drain)) as PipelineDrainFn<DrainContext> & { dispose: () => void }

  let onVisibilityChange: (() => void) | undefined

  if (autoFlush && typeof document !== 'undefined') {
    onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        drain.flush()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  drain.dispose = () => {
    if (onVisibilityChange) {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      onVisibilityChange = undefined
    }
  }

  return drain
}
