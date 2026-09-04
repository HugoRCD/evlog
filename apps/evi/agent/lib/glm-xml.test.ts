import { describe, expect, it } from 'vitest'
import { extractGlmXml, stripGlmMarkup, usesGlmXmlProtocol } from './glm-xml'

describe('usesGlmXmlProtocol', () => {
  it('matches GLM model ids', () => {
    expect(usesGlmXmlProtocol('zai/glm-5.3-flash')).toBe(true)
    expect(usesGlmXmlProtocol('z-ai/glm-4.7')).toBe(true)
    expect(usesGlmXmlProtocol('anthropic/claude-sonnet-4.6')).toBe(false)
  })
})

describe('extractGlmXml', () => {
  it('recovers a call mixed into a Slack status line', () => {
    const raw = [
      'Working on it: I\'m checking the Vercel runtime errors for the docs project first so the issue carries real evidence, then I\'ll create it on Linear.',
      '<tool_call>vercel__get_runtime_errors<arg_key>teamId</arg_key><arg_value>team_X7ikPPn4YpZ4APwufE36i53I</arg_value><arg_key>limit</arg_key><arg_value>20</arg_value></tool_call>',
    ].join('\n')

    expect(extractGlmXml(raw)).toEqual({
      text: 'Working on it: I\'m checking the Vercel runtime errors for the docs project first so the issue carries real evidence, then I\'ll create it on Linear.',
      calls: [
        {
          name: 'vercel__get_runtime_errors',
          args: { teamId: 'team_X7ikPPn4YpZ4APwufE36i53I', limit: 20 },
        },
      ],
    })
  })

  it('recovers several calls in one blob', () => {
    const raw = '<tool_call>linear__list_issues<arg_key>query</arg_key><arg_value>chat</arg_value></tool_call><tool_call>connection_search<arg_key>q</arg_key><arg_value>vercel logs</arg_value></tool_call>'
    const { calls, text } = extractGlmXml(raw)
    expect(text).toBe('')
    expect(calls).toEqual([
      { name: 'linear__list_issues', args: { query: 'chat' } },
      { name: 'connection_search', args: { q: 'vercel logs' } },
    ])
  })

  it('parses JSON object arguments', () => {
    const { calls } = extractGlmXml('<tool_call>save_issue<arg_key>input</arg_key><arg_value>{"title":"Docs chat down"}</arg_value></tool_call>')
    expect(calls).toEqual([{ name: 'save_issue', args: { input: { title: 'Docs chat down' } } },])
  })

  it('leaves ordinary replies alone', () => {
    expect(extractGlmXml('The issue is filed.')).toEqual({
      text: 'The issue is filed.',
      calls: [],
    })
  })
})

describe('stripGlmMarkup', () => {
  it('drops Slack-eaten XML fragments so they never become the reply', () => {
    expect(stripGlmMarkup('</arg_key><arg_value>team_X7ikPPn4YpZ4APwufE36i53I</arg_value></tool_call>')).toBe('')
    expect(stripGlmMarkup(
      'Working on it.\n<arg_value>team_X7ikPPn4YpZ4APwufE36i53I</arg_value><arg_key>limit</arg_key><arg_value>20</arg_value></tool_call>',
    )).toBe('Working on it.')
    expect(stripGlmMarkup('<arg_key>teamId</arg_key><arg_value>team_X7ikPPn4YpZ4APwufE36i53I</arg_value></tool_call>')).toBe('')
  })
})
