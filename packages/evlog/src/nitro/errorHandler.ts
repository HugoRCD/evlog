import { defineNitroErrorHandler } from 'nitropack/runtime'
import { setResponseHeader, setResponseStatus, send } from 'h3'

/**
 * Custom Nitro error handler that properly serializes EvlogError.
 * This ensures that 'data' (containing 'why', 'fix', 'link') is preserved
 * in the JSON response regardless of the underlying HTTP framework.
 *
 * For non-EvlogError, it delegates to Nitro's default error serialization
 * to avoid changing response shape for all errors in the host application.
 */
export default defineNitroErrorHandler((error, event) => {
  // Check if this is an EvlogError (by name or by checking cause)
  const evlogError = error.name === 'EvlogError'
    ? error
    : (error.cause as Error)?.name === 'EvlogError'
      ? error.cause as Error
      : null

  // For non-EvlogError, delegate to Nitro's default error handling
  // to avoid changing response shape for all errors in the host application
  if (!evlogError) {
    const status = (error as { statusCode?: number }).statusCode
      ?? (error as { status?: number }).status
      ?? 500
    const message = error.message || 'Internal Server Error'

    setResponseStatus(event, status)
    setResponseHeader(event, 'Content-Type', 'application/json')

    return send(event, JSON.stringify({
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

  // Serialize EvlogError with all its data
  return send(event, JSON.stringify({
    status,
    statusText: (evlogError as { statusText?: string }).statusText,
    statusCode: status,
    statusMessage: (evlogError as { statusMessage?: string }).statusMessage,
    message: evlogError.message,
    data: (evlogError as { data?: unknown }).data,
    cause: evlogError.cause instanceof Error
      ? { name: evlogError.cause.name, message: evlogError.cause.message }
      : undefined,
  }))
})
