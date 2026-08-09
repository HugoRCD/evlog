import { createHash, timingSafeEqual } from 'node:crypto'
import type { SessionAuthContext } from 'eve/context'

const PROTOCOL_VERSION = '2025-03-26'
const SERVER_INFO = { name: 'evi', version: '1.0.0' } as const

/** The principal MCP bearer sessions run under; trusted as the maintainer when the token is configured. */
export const MCP_PRINCIPAL = 'mcp:hugo'

const EVI_TOOL = {
  name: 'evi',
  description: 'Talk to Evi, the evlog maintainer agent: questions about evlog, repository work (issues, PRs, shipping a change), digests, Linear planning, captures. Pass the full request as `message`; the conversation continues across calls in the same MCP session.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      message: { type: 'string', description: 'Your full request to Evi.' },
    },
    required: ['message'],
  },
}

/**
 * Constant-time bearer comparison via digests, so neither token length nor
 * prefix leaks through timing. Absent configuration admits nobody.
 */
export function verifyMcpBearer(authorization: string | null, expected: string | undefined): boolean {
  if (!expected || !authorization?.startsWith('Bearer ')) return false
  const presented = authorization.slice('Bearer '.length).trim()
  if (presented.length === 0) return false
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** Session auth for an authenticated MCP caller: Hugo through an external harness. */
export function mcpSessionAuth(): SessionAuthContext {
  return {
    attributes: {},
    authenticator: 'mcp-bearer',
    principalId: MCP_PRINCIPAL,
    principalType: 'user',
  }
}

/**
 * Reads a session's event stream until the turn settles and returns the last
 * completed message. Events arrive parsed; the payload is on `data` or flat
 * depending on the producer, so both are read.
 */
export async function finalMessageFromStream(stream: ReadableStream<unknown>): Promise<string> {
  const reader = stream.getReader()
  let lastMessage: string | null = null
  let failure: string | null = null
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const event = value as { type?: string, data?: Record<string, unknown> } & Record<string, unknown>
      const data = (event.data ?? event) as Record<string, unknown>
      if (event.type === 'message.completed' && typeof data.message === 'string') {
        lastMessage = data.message
      }
      if (event.type === 'turn.failed' || event.type === 'session.failed') {
        failure = typeof data.message === 'string' ? data.message : 'The turn failed.'
        break
      }
      if (event.type === 'turn.completed') break
    }
  }
  finally {
    reader.releaseLock()
  }
  if (failure !== null) throw new Error(failure)
  if (lastMessage === null) throw new Error('The turn completed without a message.')
  return lastMessage
}

/** How the channel forwards a tool message into an Evi session. */
export type CallEvi = (message: string) => Promise<string>

export interface McpRpcResult {
  /** JSON body to return, or null for a no-content (202) response. */
  body: unknown
  status: number
}

function ok(id: number | string | null, result: unknown): McpRpcResult {
  return { body: { jsonrpc: '2.0', id, result }, status: 200 }
}

function err(id: number | string | null, code: number, message: string): McpRpcResult {
  return { body: { jsonrpc: '2.0', id, error: { code, message } }, status: 200 }
}

/**
 * Handles one parsed MCP JSON-RPC request. Protocol problems map to JSON-RPC
 * errors; a thrown `callEvi` becomes an `isError` tool result.
 */
export async function handleMcpRequest(body: unknown, callEvi: CallEvi): Promise<McpRpcResult> {
  if (typeof body !== 'object' || body === null || typeof (body as { method?: unknown }).method !== 'string') {
    return err(null, -32600, 'Invalid Request')
  }
  const request = body as { method: string, id?: number | string | null, params?: { name?: string, arguments?: { message?: string } } }
  const id = request.id ?? null

  switch (request.method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      })
    case 'notifications/initialized':
      return { body: null, status: 202 }
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: [EVI_TOOL] })
    case 'tools/call': {
      if (request.params?.name !== 'evi') {
        return err(id, -32601, `Unknown tool: ${String(request.params?.name)}`)
      }
      const message = request.params.arguments?.message
      if (typeof message !== 'string' || message.trim() === '') {
        return err(id, -32602, 'The `evi` tool requires a non-empty `message` string.')
      }
      try {
        const text = await callEvi(message)
        return ok(id, { content: [{ type: 'text', text }] })
      }
      catch (error) {
        const detail = error instanceof Error ? error.message : 'Internal error'
        return ok(id, { content: [{ type: 'text', text: detail }], isError: true })
      }
    }
    default:
      return err(id, -32601, `Method not found: ${String(request.method)}`)
  }
}
