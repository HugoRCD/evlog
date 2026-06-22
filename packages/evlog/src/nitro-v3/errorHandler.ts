import { parseURL } from 'ufo'
import { defineErrorHandler } from 'nitro'
import {
  resolveEvlogError,
  extractErrorStatus,
  buildPlainNitroErrorBody,
  serializeEvlogErrorResponse,
  shouldSerializeNitroErrorAsJson,
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
function getNitroV3RequestHeader(
  headers: Headers | Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined
  }
  const lower = name.toLowerCase()
  const value = headers[lower] ?? headers[name]
  return Array.isArray(value) ? value[0] : value
}

export default defineErrorHandler(async (error, event, ctx: NitroErrorHandlerContext) => {
  const evlogError = resolveEvlogError(error)
  const requestUrl = parseURL(event.req.url)

  if (!shouldSerializeNitroErrorAsJson({
    pathname: requestUrl.pathname,
    getHeader: name => getNitroV3RequestHeader(event.req.headers, name),
  }, evlogError)) {
    return
  }

  const suppressOverlay = shouldSuppressNitroDevOverlay()

  if (!suppressOverlay) {
    await ctx.defaultHandler(error, event, { silent: false })
  }

  markH3ErrorHandled(event)

  if (suppressOverlay) {
    suppressNitroDevOverlay(error)
  }

  const url = requestUrl.pathname
  const isDev = process.env.NODE_ENV === 'development'

  const body = evlogError
    ? serializeEvlogErrorResponse(evlogError, url)
    : buildPlainNitroErrorBody(error, url, isDev)
  const status = extractErrorStatus(evlogError ?? error)

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
})
