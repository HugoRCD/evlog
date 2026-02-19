import type { DrainContext, EnrichContext, TailSamplingContext, WideEvent } from '../types'
import type { NextEvlogOptions } from './types'
import { createRequestLogger, initLogger, isEnabled } from '../logger'
import { filterSafeHeaders } from '../utils'
import { shouldLog, getServiceForPath } from '../shared/routes'
import { EvlogError } from '../error'
import { evlogStorage } from './storage'

interface WithEvlogState {
  initialized: boolean
  options: NextEvlogOptions
}

const state: WithEvlogState = {
  initialized: false,
  options: {},
}

export function configureHandler(options: NextEvlogOptions): void {
  state.options = options
  state.initialized = true

  // Don't pass drain to initLogger — the global drain fires inside emitWideEvent
  // which doesn't have request/header context. Instead, we call drain ourselves
  // in callEnrichAndDrain after enrich, with full context.
  initLogger({
    enabled: options.enabled,
    env: {
      service: options.service,
      ...options.env,
    },
    pretty: options.pretty,
    sampling: options.sampling,
    stringify: options.stringify,
  })
}

function extractRequestInfo(request: Request): { method: string, path: string, headers: Record<string, string> } {
  const method = request.method
  const url = new URL(request.url, 'http://localhost')
  const path = url.pathname

  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  return { method, path, headers: filterSafeHeaders(headers) }
}

async function callEnrichAndDrain(
  emittedEvent: WideEvent | null,
  requestInfo: { method: string, path: string, requestId: string },
  headers: Record<string, string>,
  responseStatus?: number,
): Promise<void> {
  if (!emittedEvent) return

  const { enrich, drain } = state.options

  const run = async () => {
    if (enrich) {
      const enrichCtx: EnrichContext = {
        event: emittedEvent,
        request: requestInfo,
        headers,
        response: { status: responseStatus },
      }
      try {
        await enrich(enrichCtx)
      } catch (err) {
        console.error('[evlog] enrich failed:', err)
      }
    }

    if (drain) {
      const drainCtx: DrainContext = {
        event: emittedEvent,
        request: requestInfo,
        headers,
      }
      try {
        await drain(drainCtx)
      } catch (err) {
        console.error('[evlog] drain failed:', err)
      }
    }
  }

  // Use next/server after() if available to run enrich+drain after response
  try {
    const { after } = await import('next/server')
    if (typeof after === 'function') {
      after(run)
      return
    }
  } catch {
    // next/server not available or after() not exported — run inline
  }

  // Fallback: fire-and-forget (enrich still awaited for correctness)
  run().catch(() => {})
}

/**
 * Wrap a Next.js route handler or server action with evlog request-scoped logging.
 *
 * @example
 * ```ts
 * // Route handler
 * export const POST = withEvlog(async (request: NextRequest) => {
 *   const log = useLogger()
 *   log.set({ user: { id: '123' } })
 *   return Response.json({ success: true })
 * })
 *
 * // Server action
 * export const checkout = withEvlog(async (formData: FormData) => {
 *   const log = useLogger()
 *   log.set({ action: 'checkout' })
 * })
 * ```
 */
export function createWithEvlog(options: NextEvlogOptions) {
  configureHandler(options)

  return function withEvlog<TArgs extends unknown[], TReturn>(
    handler: (...args: TArgs) => TReturn,
  ): (...args: TArgs) => Promise<Awaited<TReturn>> {
    return async (...args: TArgs): Promise<Awaited<TReturn>> => {
      if (!isEnabled()) {
        return await handler(...args) as Awaited<TReturn>
      }

      // Extract request info from first argument if it's a Request
      const firstArg = args[0]
      const isRequest = firstArg instanceof Request

      let method = 'UNKNOWN'
      let path = '/'
      let headers: Record<string, string> = {}
      let requestId = crypto.randomUUID()

      if (isRequest) {
        const info = extractRequestInfo(firstArg)
        method = info.method
        path = info.path
        headers = info.headers

        // Reuse request-id from middleware if present
        const middlewareRequestId = firstArg.headers.get('x-request-id')
        if (middlewareRequestId) requestId = middlewareRequestId
      }

      // Check include/exclude patterns
      if (!shouldLog(path, state.options.include, state.options.exclude)) {
        return await handler(...args) as Awaited<TReturn>
      }

      const logger = createRequestLogger({ method, path, requestId })

      // Apply route-based service configuration
      const routeService = getServiceForPath(path, state.options.routes)
      if (routeService) {
        logger.set({ service: routeService })
      }

      // Apply start time from middleware if present
      if (isRequest) {
        const startHeader = firstArg.headers.get('x-evlog-start')
        if (startHeader) {
          logger.set({ middlewareStart: Number(startHeader) })
        }
      }

      try {
        const result = await evlogStorage.run(logger, () => handler(...args))

        // Extract response status
        let status = 200
        if (result instanceof Response) {
          status = result.status
        }
        logger.set({ status })

        // Build tail sampling context and call keep callback
        let forceKeep = false
        if (state.options.keep) {
          const tailCtx: TailSamplingContext = {
            status,
            path,
            method,
            context: logger.getContext(),
            shouldKeep: false,
          }
          await state.options.keep(tailCtx)
          forceKeep = tailCtx.shouldKeep ?? false
        }

        const emittedEvent = logger.emit({ _forceKeep: forceKeep })
        await callEnrichAndDrain(emittedEvent, { method, path, requestId }, headers, status)

        return result as Awaited<TReturn>
      } catch (error) {
        logger.error(error instanceof Error ? error : new Error(String(error)))

        const errorStatus = (error as { status?: number }).status
          ?? (error as { statusCode?: number }).statusCode
          ?? 500
        logger.set({ status: errorStatus })

        // Build tail sampling context and call keep callback
        let forceKeep = false
        if (state.options.keep) {
          const tailCtx: TailSamplingContext = {
            status: errorStatus,
            path,
            method,
            context: logger.getContext(),
            shouldKeep: false,
          }
          await state.options.keep(tailCtx)
          forceKeep = tailCtx.shouldKeep ?? false
        }

        const emittedEvent = logger.emit({ _forceKeep: forceKeep })
        await callEnrichAndDrain(emittedEvent, { method, path, requestId }, headers, errorStatus)

        // Return structured JSON response for EvlogErrors (like H3 does for Nuxt)
        if (error instanceof EvlogError) {
          return Response.json(error.toJSON(), { status: error.status }) as Awaited<TReturn>
        }

        throw error
      }
    }
  }
}
