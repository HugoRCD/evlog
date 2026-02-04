import type { RequestLogger, ServerEvent } from '../../types'

/**
 * Returns the request logger attached to the given server event.
 *
 * @param event - The current server event containing the context with the logger.
 * @returns The request-scoped logger.
 * @throws Error if the logger is not initialized on the event context.
 *
 * @example
 * export default defineEventHandler((event) => {
 *   const log = useLogger(event)
 *   log.set({ foo: 'bar' })
 *   // ...
 * })
 */
export function useLogger(event: ServerEvent): RequestLogger {
  const log = event.context.log as RequestLogger | undefined

  if (!log) {
    throw new Error(
      '[evlog] Logger not initialized. Make sure the evlog Nitro plugin is registered. '
      + 'If using Nuxt, add "evlog" to your modules.',
    )
  }

  return log
}
