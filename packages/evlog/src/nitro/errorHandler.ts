import { defineNitroErrorHandler } from 'nitropack/runtime'
import { setResponseHeader, setResponseStatus, send } from 'h3'

/**
 * Custom Nitro error handler that properly serializes EvlogError.
 * This ensures that 'data' (containing 'why', 'fix', 'link') is preserved
 * in the JSON response regardless of the underlying HTTP framework.
 */
export default defineNitroErrorHandler((error, event) => {
  // Check if this is an EvlogError (by name or by checking cause)
  const evlogError = error.name === 'EvlogError'
    ? error
    : (error.cause as Error)?.name === 'EvlogError'
      ? error.cause as Error
      : null

  const status = (error as { statusCode?: number }).statusCode
    ?? (error as { status?: number }).status
    ?? 500

  setResponseStatus(event, status)
  setResponseHeader(event, 'Content-Type', 'application/json')

  if (evlogError) {
    // Serialize EvlogError with all its data
    return send(event, JSON.stringify({
      status: (evlogError as { status?: number }).status ?? status,
      statusText: (evlogError as { statusText?: string }).statusText,
      statusCode: (evlogError as { statusCode?: number }).statusCode ?? status,
      statusMessage: (evlogError as { statusMessage?: string }).statusMessage,
      message: evlogError.message,
      data: (evlogError as { data?: unknown }).data,
      cause: evlogError.cause instanceof Error
        ? { name: evlogError.cause.name, message: evlogError.cause.message }
        : undefined,
    }))
  }

  // Default serialization for non-EvlogError
  const message = error.message || 'Internal Server Error'
  const { data } = error as { data?: unknown }

  return send(event, JSON.stringify({
    status,
    statusText: message,
    statusCode: status,
    statusMessage: message,
    message,
    ...(data !== undefined ? { data } : {}),
  }))
})
