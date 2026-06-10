import { parseURL } from 'ufo'
import { defineErrorHandler } from 'nitro'
import {
  resolveEvlogError,
  extractErrorStatus,
  buildPlainNitroErrorBody,
  serializeEvlogErrorResponse,
  shouldSuppressNitroDevOverlay,
  suppressNitroDevOverlay,
  markH3ErrorHandled,
} from '../nitro'
import type { NitroErrorHandlerContext } from '../shared/nitro-types'

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
export default defineErrorHandler(async (error, event, ctx: NitroErrorHandlerContext) => {
  const suppressOverlay = shouldSuppressNitroDevOverlay()

  if (!suppressOverlay) {
    await ctx.defaultHandler(error, event, { silent: false })
  }

  markH3ErrorHandled(event)

  if (suppressOverlay) {
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
