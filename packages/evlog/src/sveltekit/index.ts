import type { RequestLogger } from '../types'
import { createMiddlewareLogger, type BaseEvlogOptions } from '../shared/middleware'
import { extractSafeHeaders } from '../shared/headers'
import { createLoggerStorage } from '../shared/storage'
import { resolveEvlogError, extractErrorStatus, serializeEvlogErrorResponse } from '../nitro'
import { EvlogError } from '../error'

const { storage, useLogger } = createLoggerStorage(
  'handle context. Make sure evlog() handle is added to your hooks.server.ts.',
)

export interface EvlogSvelteKitOptions extends BaseEvlogOptions {}

export { useLogger }

/**
 * SvelteKit `Handle` function signature — avoids a hard dependency on `@sveltejs/kit`.
 */
type SvelteKitHandle = (input: {
  event: { request: Request; url: URL; locals: Record<string, any> }
  resolve: (event: any) => Promise<Response>
}) => Promise<Response>

/**
 * SvelteKit `HandleServerError` signature — avoids a hard dependency on `@sveltejs/kit`.
 */
type SvelteKitHandleServerError = (input: {
  error: unknown
  event: { request: Request; url: URL; locals: Record<string, any> }
  status: number
  message: string
}) => MaybePromise<void | AppError>

type MaybePromise<T> = T | Promise<T>

/** Minimal SvelteKit `App.Error` shape */
interface AppError {
  message: string
  [key: string]: unknown
}

/**
 * Create an evlog handle hook for SvelteKit.
 *
 * Add it to your `src/hooks.server.ts` using SvelteKit's `sequence` helper
 * or as the sole handle export.
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { initLogger } from 'evlog'
 * import { evlog } from 'evlog/sveltekit'
 * import { createAxiomDrain } from 'evlog/axiom'
 *
 * initLogger({ env: { service: 'my-sveltekit-app' } })
 *
 * export const handle = evlog({
 *   drain: createAxiomDrain(),
 *   enrich: (ctx) => {
 *     ctx.event.region = process.env.FLY_REGION
 *   },
 * })
 * ```
 *
 * @example
 * ```ts
 * // Compose with other hooks using sequence
 * import { sequence } from '@sveltejs/kit/hooks'
 * import { evlog } from 'evlog/sveltekit'
 *
 * export const handle = sequence(evlog(), yourOtherHook)
 * ```
 */
export function evlog(options: EvlogSvelteKitOptions = {}): SvelteKitHandle {
  return async ({ event, resolve }) => {
    const { logger, finish, skipped } = createMiddlewareLogger({
      method: event.request.method,
      path: event.url.pathname,
      requestId: event.request.headers.get('x-request-id') || crypto.randomUUID(),
      headers: extractSafeHeaders(event.request.headers),
      ...options,
    })

    if (skipped) {
      return await resolve(event)
    }

    event.locals.log = logger

    return storage.run(logger, async () => {
      try {
        const response = await resolve(event)

        // SvelteKit catches route errors internally and returns 500.
        // If handleError already logged an EvlogError with a specific status,
        // return a structured JSON response instead of SvelteKit's generic 500.
        const ctx = logger.getContext()
        const errorData = ctx.error as { name?: string; status?: number; message?: string; data?: unknown } | undefined
        if (response.status >= 500 && errorData?.name === 'EvlogError' && errorData.status) {
          const { status } = errorData
          await finish({ status })
          const body = serializeEvlogErrorResponse(errorData as EvlogError, event.url.pathname)
          return new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          })
        }

        await finish({ status: response.status })
        return response
      } catch (error) {
        await finish({ error: error as Error })

        // Return structured JSON for EvlogError (like NextJS withEvlog / Nuxt errorHandler)
        if (error instanceof EvlogError) {
          const status = error.status ?? 500
          const body = serializeEvlogErrorResponse(error, event.url.pathname)
          return new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          })
        }

        throw error
      }
    })
  }
}

/**
 * Create an evlog error handler for SvelteKit.
 *
 * Logs unhandled errors via `event.locals.log` (if available) and returns
 * structured error responses for `EvlogError` instances. For non-evlog errors,
 * returns a generic error response with sanitized messages in production.
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { evlog, evlogHandleError } from 'evlog/sveltekit'
 *
 * export const handle = evlog()
 * export const handleError = evlogHandleError()
 * ```
 */
export function evlogHandleError(): SvelteKitHandleServerError {
  return ({ error, event, status, message }) => {
    const logger = event.locals.log as RequestLogger | undefined

    if (logger && error instanceof Error) {
      logger.error(error)
    }

    const evlogError = error instanceof Error ? resolveEvlogError(error) : null

    if (evlogError) {
      const errorStatus = extractErrorStatus(evlogError)
      const response = serializeEvlogErrorResponse(evlogError, event.url.pathname)
      return {
        message: response.message as string,
        status: errorStatus,
        why: (response.data as { why?: string })?.why,
        fix: (response.data as { fix?: string })?.fix,
        link: (response.data as { link?: string })?.link,
      } as AppError
    }

    return { message, status } as AppError
  }
}

/**
 * Create both `handle` and `handleError` hooks in a single call.
 *
 * This is the recommended setup for SvelteKit — it returns both hooks
 * pre-configured and ready to export from `hooks.server.ts`.
 *
 * @example
 * ```ts
 * // src/hooks.server.ts
 * import { initLogger } from 'evlog'
 * import { createEvlogHooks } from 'evlog/sveltekit'
 * import { createAxiomDrain } from 'evlog/axiom'
 *
 * initLogger({ env: { service: 'my-app' } })
 *
 * export const { handle, handleError } = createEvlogHooks({
 *   drain: createAxiomDrain(),
 *   enrich: (ctx) => {
 *     ctx.event.region = process.env.FLY_REGION
 *   },
 * })
 * ```
 *
 * @example
 * ```ts
 * // Compose with other hooks using sequence
 * import { sequence } from '@sveltejs/kit/hooks'
 * import { createEvlogHooks } from 'evlog/sveltekit'
 *
 * const evlogHooks = createEvlogHooks()
 *
 * export const handle = sequence(evlogHooks.handle, yourOtherHook)
 * export const handleError = evlogHooks.handleError
 * ```
 */
export function createEvlogHooks(options: EvlogSvelteKitOptions = {}) {
  return {
    handle: evlog(options),
    handleError: evlogHandleError(),
  }
}
