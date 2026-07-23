// Explicit imports (unlike the rest of `server/utils/`) because this
// module's pure functions are unit-tested directly with plain vitest,
// outside Nitro's auto-import context.
import { verifyDashboardPassword } from './password'
import { isAuthEnabled } from './session'

/**
 * Extracts the token from an `Authorization: Bearer <token>` header value.
 * Returns `undefined` for a missing header, a blank token, or any other
 * auth scheme.
 */
export function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader) return undefined
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim())
  const token = match?.[1]?.trim()
  return token || undefined
}

/**
 * Soft auth for the `/mcp` endpoint. MCP clients can't do the dashboard's
 * cookie-based session auth, so they authenticate with a
 * `Authorization: Bearer <ANALYTICS_PASSWORD>` header instead. Mirrors
 * `isAuthEnabled()`'s "no ANALYTICS_PASSWORD set → no auth required"
 * behavior exactly, for consistency with the rest of the app.
 */
export function isMcpRequestAuthorized(authorizationHeader: string | undefined): boolean {
  if (!isAuthEnabled()) return true
  const token = extractBearerToken(authorizationHeader)
  return verifyDashboardPassword(token ?? '', process.env.ANALYTICS_PASSWORD ?? '')
}
