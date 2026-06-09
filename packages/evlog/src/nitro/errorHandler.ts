// Import from specific subpath — the barrel 'nitropack/runtime' re-exports from
// internal/app.mjs which imports virtual modules that crash outside rollup builds.
import { defineNitroErrorHandler } from 'nitropack/runtime/internal/error/utils'
import { getRequestURL, setResponseHeader, setResponseStatus, send } from 'h3'
import {
  resolveEvlogError,
  extractErrorStatus,
  buildPlainNitroErrorBody,
  serializeEvlogErrorResponse,
  markH3ErrorHandled,
  shouldSuppressNitroDevOverlay,
  suppressNitroDevOverlay,
} from '../nitro'

/**
 * Custom Nitro error handler that properly serializes EvlogError.
 * This ensures that 'data' (containing 'why', 'fix', 'link') is preserved
 * in the JSON response regardless of the underlying HTTP framework.
 *
 * For non-EvlogError, it preserves Nitro's default response shape while
 * sanitizing internal error details in production for 5xx errors.
 */
type NitroErrorHandlerContext = {
  defaultHandler?: (error: Error, event: unknown, opts?: { silent?: boolean; json?: boolean }) => Promise<unknown>
}

export default defineNitroErrorHandler(async (error, event, ctx?: NitroErrorHandlerContext) => {
  if (!shouldSuppressNitroDevOverlay() && ctx?.defaultHandler) {
    await ctx.defaultHandler(error, event, { silent: false })
  }

  markH3ErrorHandled(event)
  if (shouldSuppressNitroDevOverlay()) {
    suppressNitroDevOverlay(error)
  }

  const evlogError = resolveEvlogError(error)

  const isDev = process.env.NODE_ENV === 'development'
  const url = getRequestURL(event, { xForwardedHost: true }).pathname

  if (!evlogError) {
    const body = buildPlainNitroErrorBody(error, url, isDev)
    setResponseStatus(event, body.status as number)
    setResponseHeader(event, 'Content-Type', 'application/json')
    return send(event, JSON.stringify(body))
  }

  const status = extractErrorStatus(evlogError)

  setResponseStatus(event, status)
  setResponseHeader(event, 'Content-Type', 'application/json')

  return send(event, JSON.stringify(serializeEvlogErrorResponse(evlogError, url)))
})
