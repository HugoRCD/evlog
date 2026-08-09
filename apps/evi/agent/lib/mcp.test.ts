import { describe, expect, it } from 'vitest'
import { finalMessageFromStream, handleMcpRequest, verifyMcpBearer } from './mcp'

function streamOf(events: unknown[]): ReadableStream<unknown> {
  return new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(event)
      controller.close()
    },
  })
}

describe('verifyMcpBearer', () => {
  it('accepts only the exact configured token', () => {
    expect(verifyMcpBearer('Bearer tok-123', 'tok-123')).toBe(true)
    expect(verifyMcpBearer('Bearer tok-124', 'tok-123')).toBe(false)
    expect(verifyMcpBearer('Bearer ', 'tok-123')).toBe(false)
    expect(verifyMcpBearer('Basic tok-123', 'tok-123')).toBe(false)
    expect(verifyMcpBearer(null, 'tok-123')).toBe(false)
  })

  it('admits nobody when the token is not configured', () => {
    expect(verifyMcpBearer('Bearer anything', undefined)).toBe(false)
    expect(verifyMcpBearer('Bearer anything', '')).toBe(false)
  })
})

describe('handleMcpRequest', () => {
  const echo = async (message: string) => `echo: ${message}`

  it('answers the protocol lifecycle', async () => {
    const init = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, echo)
    expect(init.status).toBe(200)
    expect((init.body as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe('evi')
    expect((await handleMcpRequest({ method: 'notifications/initialized' }, echo)).body).toBeNull()
    const tools = await handleMcpRequest({ id: 2, method: 'tools/list' }, echo)
    expect((tools.body as { result: { tools: { name: string }[] } }).result.tools.map(t => t.name)).toEqual(['evi'])
  })

  it('routes a valid tools/call and surfaces failures as isError results', async () => {
    const call = await handleMcpRequest(
      { id: 3, method: 'tools/call', params: { name: 'evi', arguments: { message: 'hi' } } },
      echo,
    )
    expect((call.body as { result: { content: { text: string }[] } }).result.content[0]?.text).toBe('echo: hi')

    const failing = await handleMcpRequest(
      { id: 4, method: 'tools/call', params: { name: 'evi', arguments: { message: 'hi' } } },
      async () => { throw new Error('turn died') },
    )
    expect((failing.body as { result: { isError: boolean, content: { text: string }[] } }).result.isError).toBe(true)
  })

  it('rejects unknown tools, empty messages, and malformed bodies', async () => {
    const unknown = await handleMcpRequest({ id: 5, method: 'tools/call', params: { name: 'x' } }, echo)
    expect((unknown.body as { error: { code: number } }).error.code).toBe(-32601)
    const empty = await handleMcpRequest({ id: 6, method: 'tools/call', params: { name: 'evi', arguments: { message: ' ' } } }, echo)
    expect((empty.body as { error: { code: number } }).error.code).toBe(-32602)
    const bad = await handleMcpRequest('nope', echo)
    expect((bad.body as { error: { code: number } }).error.code).toBe(-32600)
  })
})

describe('finalMessageFromStream', () => {
  it('returns the last completed message once the turn settles', async () => {
    await expect(finalMessageFromStream(streamOf([
      { type: 'turn.started' },
      { type: 'message.completed', data: { message: 'first' } },
      { type: 'message.completed', message: 'final' },
      { type: 'turn.completed' },
      { type: 'message.completed', data: { message: 'after terminal, ignored' } },
    ]))).resolves.toBe('final')
  })

  it('throws on a failed turn and on a silent completion', async () => {
    await expect(finalMessageFromStream(streamOf([
      { type: 'turn.failed', data: { message: 'model exploded' } },
    ]))).rejects.toThrow('model exploded')
    await expect(finalMessageFromStream(streamOf([
      { type: 'turn.completed' },
    ]))).rejects.toThrow('without a message')
  })
})
