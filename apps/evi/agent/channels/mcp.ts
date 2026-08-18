import { createHash, timingSafeEqual } from 'node:crypto'
import { localDev, vercelOidc } from 'eve/channels/auth'
import { mcpChannel } from 'eve/channels/mcp'

/** The principal MCP bearer sessions run under; trusted as the maintainer when the token is configured. */
const MCP_PRINCIPAL = 'mcp:hugo'

/** Captured at module load so the auth strategy sees the configured token. */
const expectedToken = process.env.EVI_MCP_TOKEN?.trim()

/**
 * Timing-safe bearer comparison via digests, so neither token length nor
 * prefix leaks through timing. Absent configuration admits nobody.
 */
function verifyMcpBearer(authorization: string | null, expected: string | undefined): boolean {
  if (!expected || !authorization?.startsWith('Bearer ')) return false
  const presented = authorization.slice('Bearer '.length).trim()
  if (presented.length === 0) return false
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** Auth strategy that validates the configured MCP bearer token. */
const mcpAuth: (request: Request) => Promise<{
  attributes: Record<string, never>
  authenticator: string
  principalId: string
  principalType: string
} | null> = async (request) => {
  const authHeader = request.headers.get('authorization')
  if (!verifyMcpBearer(authHeader, expectedToken)) return null
  return {
    attributes: {},
    authenticator: 'mcp-bearer',
    principalId: MCP_PRINCIPAL,
    principalType: 'user',
  }
}

/**
 * Exposes Evi over the Model Context Protocol at POST /eve/v1/mcp, for
 * external harnesses (Raycast AI, Claude Code, Cursor). The channel exposes
 * durable invocation tools (`agent_start`, `agent_get`, `agent_update`,
 * `agent_cancel`) that forward work into a real Evi session under the
 * `mcp:hugo` principal, which agent/lib/trust.ts trusts as the maintainer
 * only while EVI_MCP_TOKEN is configured.
 *
 * The mcp-session-id issued on initialize keys the eve continuation address,
 * so one Raycast chat maps to one Evi conversation.
 */
export default mcpChannel({
  auth: [vercelOidc(), localDev(), mcpAuth],
  route: '/eve/v1/mcp',
})
