import { describe, expect, it } from 'vitest'
import { recoverGlmXmlContent, rewriteGlmXmlStream } from './glm-xml-middleware'

describe('recoverGlmXmlContent', () => {
  it('turns text XML into tool-call parts and keeps the prose', () => {
    const { content, recovered } = recoverGlmXmlContent([
      {
        type: 'text',
        text: 'On it.\n<tool_call>linear__list_issues<arg_key>limit</arg_key><arg_value>20</arg_value></tool_call>',
      },
    ])
    expect(recovered).toBe(1)
    expect(content).toEqual([
      { type: 'text', text: 'On it.' },
      {
        type: 'tool-call',
        toolCallId: expect.stringMatching(/^glmxml_/),
        toolName: 'linear__list_issues',
        input: '{"limit":20}',
      },
    ])
  })

  it('passes native tool-call parts through', () => {
    const native = { type: 'tool-call' as const, toolCallId: 'call_1', toolName: 'bash', input: '{}' }
    const { content, recovered } = recoverGlmXmlContent([native])
    expect(recovered).toBe(0)
    expect(content).toEqual([native])
  })
})

describe('rewriteGlmXmlStream', () => {
  it('replaces leaked XML text-deltas with tool-call chunks', () => {
    const rewritten = rewriteGlmXmlStream([
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Hi. <tool_call>docs__get-page<arg_key>path</arg_key><arg_value>/chat</arg_value></tool_call>' },
      { type: 'text-end', id: 't1' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 4, text: 4, reasoning: undefined },
        },
      },
    ])

    expect(rewritten.filter(chunk => chunk.type === 'text-delta')).toEqual([{ type: 'text-delta', id: 't1', delta: 'Hi.' },])
    expect(rewritten.some(chunk => chunk.type === 'tool-call' && chunk.toolName === 'docs__get-page')).toBe(true)
    const finish = rewritten.find(chunk => chunk.type === 'finish')
    expect(finish?.type === 'finish' && finish.finishReason.unified).toBe('tool-calls')
  })
})
