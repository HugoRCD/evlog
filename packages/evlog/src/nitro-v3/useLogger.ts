import type { HTTPEvent } from 'nitro/h3'
import type { RequestLogger } from '../types'

/**
 * Returns the request logger attached to the given Nitro v3 HTTP event.
 *
 * @param event - The current HTTPEvent from Nitro v3.
 * @param service - Optional service name to override the default service.
 * @returns The request-scoped logger.
 * @throws Error if the logger is not initialized on the event context.
 *
 * @example
 * import { useLogger } from 'evlog/nitro/v3'
 *
 * export default defineHandler((event) => {
 *   const log = useLogger(event)
 *   log.set({ foo: 'bar' })
 * })
 */
export function useLogger<T extends object = Record<string, unknown>>(event: HTTPEvent, service?: string): RequestLogger<T> {
  const ctx = event.req.context as Record<string, unknown> | undefined
  const log = ctx?.log as RequestLogger<T> | undefined

  if (!log) {
    throw new Error(
      '[evlog] Logger not initialized. Make sure the evlog Nitro module is registered in nitro.config.ts. '
      + 'Example: modules: [evlog({ env: { service: \'my-app\' } })]',
    )
  }

  if (service) {
    const untyped = log as unknown as RequestLogger
    untyped.set({ service })
  }

  return log
}
