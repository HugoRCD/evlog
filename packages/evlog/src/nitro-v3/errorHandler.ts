import { parseURL } from 'ufo'
import { defineErrorHandler } from 'nitro'
import {
  resolveEvlogError,
  extractErrorStatus,
  buildPlainNitroErrorBody,
  serializeEvlogErrorResponse,
  shouldSuppressNitroDevOverlay,
  suppressNitroDevOverlay,
} from '../nitro'

/**
 * Custom Nitro v3 error handler that properly serializes EvlogError.
 * This ensures that 'data' (containing 'why', 'fix', 'link') is preserved
 * in the JSON response regardless of the underlying HTTP framework.
 *
 * Usage in nitro.config.ts:
 * ```ts
 * export { default } from 'evlog/nitro/v3/errorHandler'
 * ```
 */
export default defineErrorHandler((error, event) => {
  if (shouldSuppressNitroDevOverlay()) {
    suppressNitroDevOverlay(error)
  }

  const url = parseURL(event.req.url).pathname
  const isDev = process.env.NODE_ENV === 'development'
  const evlogError = resolveEvlogError(error)

  const body = evlogError
    ? serializeEvlogErrorResponse(evlogError, url)
    : buildPlainNitroErrorBody(error, url, isDev)
  const status = extractErrorStatus(evlogError ?? error)

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
})
