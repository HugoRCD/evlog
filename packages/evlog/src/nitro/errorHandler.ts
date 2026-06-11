// Import from specific subpath — the barrel 'nitropack/runtime' re-exports from
// internal/app.mjs which imports virtual modules that crash outside rollup builds.
import type { ServerResponse } from 'node:http'
import { defineNitroErrorHandler } from 'nitropack/runtime/internal/error/utils'
import { getRequestURL, setResponseHeader, setResponseStatus, send } from 'h3'
import type { H3Event } from 'h3'
import {
  resolveEvlogError,
  extractErrorStatus,
  buildPlainNitroErrorBody,
  serializeEvlogErrorResponse,
  markH3ErrorHandled,
  shouldSuppressNitroDevOverlay,
  suppressNitroDevOverlay,
} from '../nitro'

type WritableNodeResponse = Pick<ServerResponse, 'end' | 'writableEnded'> & { ended?: boolean }

async function sendNitroV2Json(event: H3Event, body: string): Promise<void> {
  const res = event.node?.res as WritableNodeResponse | undefined
  if (res) {
    if (res.writableEnded || res.ended) {
      return
    }

    res.end(body)
    return
  }

  await send(event, body)
}

/**
 * Custom Nitro error handler that properly serializes EvlogError.
 * This ensures that 'data' (containing 'why', 'fix', 'link') is preserved
 * in the JSON response regardless of the underlying HTTP framework.
 *
 * For non-EvlogError, it preserves Nitro's default response shape while
 * sanitizing internal error details in production for 5xx errors.
 */
export default defineNitroErrorHandler(async (error, event, ctx) => {
  const suppressOverlay = shouldSuppressNitroDevOverlay()

  if (!suppressOverlay && ctx?.defaultHandler) {
    await ctx.defaultHandler(error, event, { silent: false })
  }

  markH3ErrorHandled(event)
  if (suppressOverlay) {
    suppressNitroDevOverlay(error)
  }

  const evlogError = resolveEvlogError(error)

  const isDev = process.env.NODE_ENV === 'development'
  const url = getRequestURL(event, { xForwardedHost: true }).pathname

  if (!evlogError) {
    const body = buildPlainNitroErrorBody(error, url, isDev)
    setResponseStatus(event, body.status as number)
    setResponseHeader(event, 'Content-Type', 'application/json')
    return sendNitroV2Json(event, JSON.stringify(body))
  }

  const status = extractErrorStatus(evlogError)

  setResponseStatus(event, status)
  setResponseHeader(event, 'Content-Type', 'application/json')

  return sendNitroV2Json(event, JSON.stringify(serializeEvlogErrorResponse(evlogError, url)))
})
