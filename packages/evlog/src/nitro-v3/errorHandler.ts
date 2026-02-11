import type { HTTPEvent } from 'nitro/h3'
import { parseURL } from 'ufo'
import { defineErrorHandler } from 'nitro'
import { EvlogError } from '../error'

/**
 * Custom Nitro v3 error handler that properly serializes EvlogError.
 * This ensures that 'data' (containing 'why', 'fix', 'link') is preserved
 * in the JSON response regardless of the underlying HTTP framework.
 *
 * For non-EvlogError, it preserves Nitro's default response shape while
 * sanitizing internal error details in production for 5xx errors.
 *
 * Usage in nitro.config.ts:
 * ```ts
 * // errorHandler.ts
 * export { default } from 'evlog/nitro/v3/errorHandler'
 * // nitro.config.ts
 * export default defineConfig({
 *   errorHandler: './errorHandler',
 * })
 * ```
 */
export const evlogErrorHandler = defineErrorHandler(async (error, event, { defaultHandler }): Promise<Response> => {
  // Check if this is an EvlogError (by name or by checking cause)

  const evlogError = error.name === 'EvlogError'
    ? error
    : (error.cause as Error)?.name === 'EvlogError'
      ? error.cause as Error
      : error.cause instanceof EvlogError 
        ? error.cause
        : null


  const isDev = process.env.NODE_ENV === 'development'
  const url = parseURL(event.req.url).pathname

  // For non-EvlogError, preserve Nitro's default response shape
  if (!evlogError) {
    const res = await defaultHandler(error, event, { json: true })
    const body = typeof res.body === 'string' ? res.body : JSON.stringify(res.body)
    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }


  // Derive status from evlogError to ensure consistency between
  // HTTP response status and response body
  const status = (evlogError as { status?: number }).status
    ?? (evlogError as { statusCode?: number }).statusCode
    ?? 500

  // Serialize EvlogError with all its data, preserving Nitro's response shape
  const { data } = evlogError as { data?: unknown }
  const statusMessage = (evlogError as { statusMessage?: string }).statusMessage || evlogError.message
  return new Response(JSON.stringify({
    url,
    status,
    statusCode: status,
    statusText: statusMessage,
    statusMessage,
    message: evlogError.message,
    error: true,
    ...(data !== undefined && { data }),
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
})

export default evlogErrorHandler
