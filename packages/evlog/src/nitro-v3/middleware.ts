import type { RequestLogger } from '../types'
import { EvlogError } from '../error'
import { serializeEvlogErrorResponse } from '../nitro'

/**
 * Server middleware handler that catches EvlogError and returns a structured JSON response.
 *
 * Frameworks like TanStack Start catch thrown errors before Nitro's error handler,
 * stripping the `data` field (containing `why`, `fix`, `link`). This middleware
 * intercepts EvlogErrors first, attaches them to the wide event, and throws a
 * `Response` that the framework passes through directly.
 *
 * @example TanStack Start
 * ```ts
 * import { createMiddleware } from '@tanstack/react-start'
 * import { evlogErrorHandler } from 'evlog/nitro/v3'
 *
 * const evlogMiddleware = createMiddleware().server(evlogErrorHandler)
 *
 * export const Route = createRootRoute({
 *   server: { middleware: [evlogMiddleware] },
 * })
 * ```
 */

export async function evlogErrorHandler<T>(next: (...args: any[]) => Promise<T>): Promise<T> {
  try {
    return await next()
  } catch (error: unknown) {
    if (error instanceof EvlogError || (error && typeof error === 'object' && (error as Error).name === 'EvlogError')) {
      const evlogError = error as EvlogError

      try {
        const { useRequest } = await import('nitro/context')
        const req = useRequest()
        const log = req.context?.log as RequestLogger | undefined
        log?.error(evlogError)
      } catch {
        // ignore
      }

      // Throw as Response so frameworks (TanStack Start, SolidStart, etc.) pass it through
      throw new Response(JSON.stringify(evlogError.toJSON()), {
        status: evlogError.status || 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw error
  }
}
