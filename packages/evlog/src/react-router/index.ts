import { createContext } from 'react-router'
import type { RequestLogger } from '../types'
import { createMiddlewareLogger, type BaseEvlogOptions } from '../shared/middleware'
import { extractSafeHeaders } from '../shared/headers'
import { createLoggerStorage } from '../shared/storage'
import { EvlogError } from '../error'
import { serializeEvlogErrorResponse } from '../nitro'

const { storage, useLogger } = createLoggerStorage(
  'middleware context. Make sure the evlog middleware is added to your route.',
)

/**
 * Typed context key for accessing the evlog logger in loaders and actions.
 *
 * @example
 * ```ts
 * import { loggerContext } from 'evlog/react-router'
 *
 * export async function loader({ context }: Route.LoaderArgs) {
 *   const log = context.get(loggerContext)
 *   log.set({ user: { id: 'u-1' } })
 *   return { ok: true }
 * }
 * ```
 */
export const loggerContext = createContext<RequestLogger>()

export type EvlogReactRouterOptions = BaseEvlogOptions

export { useLogger }

/**
 * Create an evlog middleware for React Router.
 *
 * @example
 * ```ts
 * // app/root.tsx
 * import { evlog } from 'evlog/react-router'
 *
 * export const middleware: Route.MiddlewareFunction[] = [
 *   evlog({ drain: createAxiomDrain() }),
 * ]
 * ```
 */
export function evlog(options: EvlogReactRouterOptions = {}) {
  return async (
    { request, context }: { request: Request; context: { set(ctx: unknown, value: unknown): void } },
    next: () => Promise<Response>,
  ): Promise<Response> => {
    const url = new URL(request.url)
    const { logger, finish, skipped } = createMiddlewareLogger({
      method: request.method,
      path: url.pathname,
      requestId: request.headers.get('x-request-id') || crypto.randomUUID(),
      headers: extractSafeHeaders(request.headers),
      ...options,
    })

    if (skipped) {
      return next()
    }

    context.set(loggerContext, logger)

    try {
      const response = await storage.run(logger, () => next())
      await finish({ status: response.status })
      return response
    } catch (error) {
      await finish({ error: error as Error })

      if (error instanceof EvlogError) {
        const status = error.status ?? 500
        const body = serializeEvlogErrorResponse(error, url.pathname)
        return new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      }

      throw error
    }
  }
}
