import { defineNitroErrorHandler } from 'nitropack/runtime'
import { getRequestURL, setResponseHeader, setResponseStatus, send } from 'h3'

/**
 * Custom Nitro error handler that properly serializes EvlogError.
 * This ensures that 'data' (containing 'why', 'fix', 'link') is preserved
 * in the JSON response regardless of the underlying HTTP framework.
 *
 * For non-EvlogError, it preserves Nitro's default response shape while
 * sanitizing internal error details in production for 5xx errors.
 */
export default defineNitroErrorHandler((error, event) => {
  // Check if this is an EvlogError (by name or by checking cause)
  const evlogError = error.name === 'EvlogError'
    ? error
    : (error.cause as Error)?.name === 'EvlogError'
      ? error.cause as Error
      : null

  const isDev = process.env.NODE_ENV === 'development'
  const url = getRequestURL(event, { xForwardedHost: true }).pathname

  // For non-EvlogError, preserve Nitro's default response shape
  if (!evlogError) {
    const status = (error as { statusCode?: number }).statusCode
      ?? (error as { status?: number }).status
      ?? 500

    // Sanitize internal error details in production for 5xx errors
    const message = isDev
      ? (error.message || 'Internal Server Error')
      : (status >= 500 ? 'Internal Server Error' : (error.message || 'Internal Server Error'))

    setResponseStatus(event, status)
    setResponseHeader(event, 'Content-Type', 'application/json')

    // Preserve Nitro's default response shape
    return send(event, JSON.stringify({
      url,
      statusCode: status,
      statusMessage: message,
      message,
    }))
  }

  // Derive status from evlogError to ensure consistency between
  // HTTP response status and response body
  const status = (evlogError as { status?: number }).status
    ?? (evlogError as { statusCode?: number }).statusCode
    ?? 500

  setResponseStatus(event, status)
  setResponseHeader(event, 'Content-Type', 'application/json')

  // Serialize EvlogError with all its data, preserving Nitro's response shape
  return send(event, JSON.stringify({
    url,
    statusCode: status,
    statusMessage: (evlogError as { statusMessage?: string }).statusMessage || evlogError.message,
    message: evlogError.message,
    data: (evlogError as { data?: unknown }).data,
  }))
})
