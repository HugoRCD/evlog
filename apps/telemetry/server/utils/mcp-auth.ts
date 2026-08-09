// Explicit imports (unlike the rest of `server/utils/`) because this
// module's pure functions are unit-tested directly with plain vitest,
// outside Nitro's auto-import context.
import { verifyDashboardPassword } from './password'
import { isAuthEnabled } from './session'
import { isVercelOidcToken } from './vercel-oidc'

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
 * `Authorization: Bearer <token>` header instead. A request is authorized
 * when the token matches `ANALYTICS_PASSWORD` (human MCP clients) or is a
 * valid Vercel OIDC token from the evi project's production environment
 * (the agent, which has no password to share). Mirrors
 * `isAuthEnabled()`'s "no ANALYTICS_PASSWORD set → no auth required"
 * behavior exactly, for consistency with the rest of the app.
 *
 * The OIDC verifier is injectable so unit tests stay off the network.
 */
export async function isMcpRequestAuthorized(
  authorizationHeader: string | undefined,
  verifyOidc: (token: string) => Promise<boolean> = isVercelOidcToken,
): Promise<boolean> {
  if (!isAuthEnabled()) return true
  const token = extractBearerToken(authorizationHeader)
  if (!token) return false
  if (verifyDashboardPassword(token, process.env.ANALYTICS_PASSWORD ?? '')) return true
  return await verifyOidc(token)
}
