// Import from specific subpath — the barrel 'nitropack/runtime' re-exports from
// internal/app.mjs which imports virtual modules that crash outside rollup builds.
import { defineNitroErrorHandler } from 'nitropack/runtime/internal/error/utils'
import { getRequestURL, setResponseHeader, setResponseStatus, send } from 'h3'
import { resolveEvlogError, extractErrorStatus, serializeEvlogErrorResponse } from '../nitro'

/**
 * Custom Nitro error handler that properly serializes EvlogError.
 * This ensures that 'data' (containing 'why', 'fix', 'link') is preserved
 * in the JSON response regardless of the underlying HTTP framework.
 *
 * For non-EvlogError, it preserves Nitro's default response shape while
 * sanitizing internal error details in production for 5xx errors.
 */
export default defineNitroErrorHandler((error, event) => {
  const evlogError = resolveEvlogError(error)

  const isDev = process.env.NODE_ENV === 'development'
  const url = getRequestURL(event, { xForwardedHost: true }).pathname

  // For non-EvlogError, preserve Nitro's default response shape
  if (!evlogError) {
    const status = extractErrorStatus(error)

    // Derive message from statusText/statusMessage/message for cross-version compatibility
    const rawMessage = ((error as { statusText?: string }).statusText
      ?? (error as { statusMessage?: string }).statusMessage
      ?? error.message) || 'Internal Server Error'

    // Sanitize internal error details in production for 5xx errors
    const message = isDev
      ? rawMessage
      : (status >= 500 ? 'Internal Server Error' : rawMessage)

    setResponseStatus(event, status)
    setResponseHeader(event, 'Content-Type', 'application/json')

    return send(event, JSON.stringify({
      url,
      status,
      statusCode: status,
      statusText: message,
      statusMessage: message,
      message,
      error: true,
    }))
  }

  const status = extractErrorStatus(evlogError)

  setResponseStatus(event, status)
  setResponseHeader(event, 'Content-Type', 'application/json')

  return send(event, JSON.stringify(serializeEvlogErrorResponse(evlogError, url)))
})
