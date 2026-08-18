import type { ModelMessage } from 'ai'
import { describe, expect, it } from 'vitest'
import type { ProviderPrompt } from './model'
import { MODEL, modelForMessages, modelForStep, stubVisualPrompt, VISION_MODEL } from './model'

describe('modelForMessages', () => {
  it('selects the base model for a text-only conversation', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'instructions' },
      { role: 'user', content: [{ type: 'text', text: 'a text part' }] },
      { role: 'assistant', content: 'an answer' },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'a', output: { type: 'json', value: { ok: true } } }] },
    ]
    expect(modelForMessages(messages)).toBe(MODEL)
  })

  it('selects the vision model when a user message carries an image or file part', () => {
    expect(modelForMessages([{ role: 'user', content: [{ type: 'image', image: 'aGVsbG8=' }] }])).toBe(VISION_MODEL)
    expect(modelForMessages([{ role: 'user', content: [{ type: 'file', data: new URL('https://media.example/photo'), mediaType: 'image/jpeg' }] }])).toBe(VISION_MODEL)
  })

  it('selects the vision model when a tool result carries binary content', () => {
    const messages: ModelMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'images__view',
            output: { type: 'content', value: [{ type: 'text', text: 'Image:' }, { type: 'image-data', data: 'aGVsbG8=', mediaType: 'image/png' }] },
          }
        ],
      }
    ]
    expect(modelForMessages(messages)).toBe(VISION_MODEL)
  })

  it('returns to the base model on the turn after an image', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'look at this' }, { type: 'image', image: 'aGVsbG8=' }] },
      { role: 'assistant', content: 'described it' },
      { role: 'user', content: [{ type: 'text', text: 'now bump eve' }] },
    ]
    expect(modelForMessages(messages)).toBe(MODEL)
  })

  it('stays on the vision model for a screenshot produced during the current turn', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'open the page' }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'browser', output: { type: 'content', value: [{ type: 'image-data', data: 'aGVsbG8=', mediaType: 'image/png' }] } }] },
    ]
    expect(modelForMessages(messages)).toBe(VISION_MODEL)
  })
})

describe('modelForStep', () => {
  const imageTurn: ModelMessage[] = [
    { role: 'user', content: [{ type: 'image', image: 'aGVsbG8=' }] },
    { role: 'assistant', content: 'described it' },
  ]

  it('passes the plain model ids through for clean and current-image histories', () => {
    expect(modelForStep([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }])).toBe(MODEL)
    expect(modelForStep([{ role: 'user', content: [{ type: 'image', image: 'aGVsbG8=' }] }])).toBe(VISION_MODEL)
  })

  it('wraps the base model when only earlier turns carried images', () => {
    const selected = modelForStep([...imageTurn, { role: 'user', content: [{ type: 'text', text: 'next task' }] }])
    expect(selected).toMatchObject({ modelId: MODEL })
  })
})

describe('stubVisualPrompt', () => {
  it('replaces file parts and binary tool results with text stubs, leaving text intact', () => {
    const prompt: ProviderPrompt = [
      { role: 'system', content: 'instructions' },
      { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'file', data: { type: 'data', data: 'aGVsbG8=' }, mediaType: 'image/png' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'described it' }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'browser', output: { type: 'content', value: [{ type: 'text', text: 'Image:' }, { type: 'file', data: { type: 'data', data: 'aGVsbG8=' }, mediaType: 'image/png' }] } }] },
    ]
    const stubbed = stubVisualPrompt(prompt)
    expect(JSON.stringify(stubbed)).not.toContain('aGVsbG8=')
    expect(stubbed[0]).toEqual(prompt[0])
    const user = stubbed[1]
    if (user?.role !== 'user') throw new Error('user message expected')
    expect(user.content[0]).toEqual({ type: 'text', text: 'look' })
    expect(user.content[1]).toMatchObject({ type: 'text' })
    const tool = stubbed[3]
    if (tool?.role !== 'tool' || tool.content[0]?.type !== 'tool-result') throw new Error('tool result expected')
    const output = tool.content[0].output
    if (output.type !== 'content') throw new Error('content output expected')
    expect(output.value[0]).toEqual({ type: 'text', text: 'Image:' })
    expect(output.value[1]).toMatchObject({ type: 'text' })
  })
})
