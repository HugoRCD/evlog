import type { RequestLogger, ServerEvent } from '../../types'

/**
 * Returns the request logger attached to the given server event.
 *
 * @param event - The current server event containing the context with the logger.
 * @param service - Optional service name to override the default service.
 * @returns The request-scoped logger.
 * @throws Error if the logger is not initialized on the event context.
 *
 * @example
 * export default defineEventHandler((event) => {
 *   const log = useLogger(event)
 *   log.set({ foo: 'bar' })
 *   // ...
 * })
 *
 * @example
 * // Override service name for specific routes
 * export default defineEventHandler((event) => {
 *   const log = useLogger(event, 'payment-service')
 *   log.set({ foo: 'bar' })
 *   // ...
 * })
 */
export function useLogger(event: ServerEvent, service?: string): RequestLogger {
  const log = event.context.log as RequestLogger | undefined

  if (!log) {
    throw new Error(
      '[evlog] Logger not initialized. Make sure the evlog Nitro plugin is registered. '
      + 'If using Nuxt, add "evlog" to your modules.',
    )
  }

  if (service) {
    log.set({ service })
  }

  return log
}
