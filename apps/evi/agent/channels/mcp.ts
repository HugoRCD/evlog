import { randomUUID } from 'node:crypto'
import { defineChannel, GET, POST } from 'eve/channels'
import { finalMessageFromStream, handleMcpRequest, mcpSessionAuth, verifyMcpBearer } from '../lib/mcp'

/**
 * Exposes Evi over the Model Context Protocol at POST /eve/v1/mcp, for
 * external harnesses (Raycast AI, Claude Code, Cursor). One `evi` tool
 * forwards the message into a real Evi session under the `mcp:hugo`
 * principal, which agent/lib/trust.ts trusts as the maintainer only while
 * EVI_MCP_TOKEN is configured. Protocol handling lives in agent/lib/mcp.ts.
 *
 * The mcp-session-id issued on initialize keys the eve continuation token,
 * so one Raycast chat maps to one Evi conversation.
 */

// A shipping flow (checks, push, PR) runs for minutes; let the synchronous tool call wait.
export const maxDuration = 800

function unauthorized(): Response {
  return new Response(null, {
    status: 401,
    headers: { 'www-authenticate': 'Bearer realm="evi-mcp"' },
  })
}

function parseError(): Response {
  return Response.json(
    { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  )
}

export default defineChannel({
  cors: {
    methods: ['GET', 'POST'],
    allowHeaders: ['authorization', 'content-type', 'mcp-protocol-version', 'mcp-session-id'],
  },
  routes: [
    // Absolute path: custom-channel routes are not auto-prefixed, and only
    // /eve/v1/* is the eve surface in production.
    // Streamable HTTP: no server-initiated streams are offered, so GET is a
    // spec-compliant 405 instead of an SSE channel.
    GET('/eve/v1/mcp', async () => new Response(null, { status: 405, headers: { allow: 'POST' } })),
    POST('/eve/v1/mcp', async (req, { send }) => {
      if (!verifyMcpBearer(req.headers.get('authorization'), process.env.EVI_MCP_TOKEN?.trim())) {
        return unauthorized()
      }

      let body: unknown
      try {
        body = await req.json()
      }
      catch {
        return parseError()
      }

      const mcpSessionId = req.headers.get('mcp-session-id')?.trim() || randomUUID()
      const result = await handleMcpRequest(body, async (message) => {
        const session = await send(message, {
          auth: mcpSessionAuth(),
          continuationToken: `mcp:${mcpSessionId}`,
        })
        return await finalMessageFromStream(await session.getEventStream())
      })

      const headers: Record<string, string> = {
        'cache-control': 'no-store',
        'mcp-session-id': mcpSessionId,
      }
      if (result.body === null) return new Response(null, { status: result.status, headers })
      return Response.json(result.body, { status: result.status, headers })
    }),
  ],
})
