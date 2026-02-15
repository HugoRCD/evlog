import { parseURL } from 'ufo'
import { defineErrorHandler } from 'nitro'
import { resolveEvlogError, extractErrorStatus, serializeEvlogErrorResponse } from '../nitro'

/**
 * Custom Nitro v3 error handler that properly serializes EvlogError.
 * This ensures that 'data' (containing 'why', 'fix', 'link') is preserved
 * in the JSON response regardless of the underlying HTTP framework.
 *
 * For non-EvlogError, returns undefined to let Nitro's default handler take over.
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
export default defineErrorHandler((error, event) => {
  const evlogError = resolveEvlogError(error)

  if (!evlogError) return

  const url = parseURL(event.req.url).pathname
  const status = extractErrorStatus(evlogError)

  return new Response(JSON.stringify(serializeEvlogErrorResponse(evlogError, url)), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
})
