import type { ModelMessage } from 'ai'
import { describe, expect, it } from 'vitest'
import { hasVisualParts, MODEL, modelForMessages, VISION_MODEL } from './model'

describe('hasVisualParts', () => {
  it('is false for a text-only conversation', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'instructions' },
      { role: 'user', content: 'plain string content' },
      { role: 'user', content: [{ type: 'text', text: 'a text part' }] },
      { role: 'assistant', content: 'an answer' },
    ]
    expect(hasVisualParts(messages)).toBe(false)
  })

  it('detects an image part in a user message', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image', image: 'aGVsbG8=' }] },]
    expect(hasVisualParts(messages)).toBe(true)
  })

  it('detects a file part in a user message, URL-referenced attachments included', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: [{ type: 'file', data: new URL('https://media.example/photo'), mediaType: 'image/jpeg' }] },]
    expect(hasVisualParts(messages)).toBe(true)
  })

  it('detects a binary content part in a tool result', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'see the screenshot' },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'images__view',
            output: {
              type: 'content',
              value: [
                { type: 'text', text: 'Image:' },
                { type: 'image-data', data: 'aGVsbG8=', mediaType: 'image/png' },
              ],
            },
          }
        ],
      },
    ]
    expect(hasVisualParts(messages)).toBe(true)
  })

  it('ignores text and json tool results', () => {
    const messages: ModelMessage[] = [
      {
        role: 'tool',
        content: [
          { type: 'tool-result', toolCallId: 'call-1', toolName: 'a', output: { type: 'text', value: 'done' } },
          { type: 'tool-result', toolCallId: 'call-2', toolName: 'b', output: { type: 'json', value: { ok: true } } },
          { type: 'tool-result', toolCallId: 'call-3', toolName: 'c', output: { type: 'content', value: [{ type: 'text', text: 'only text' }] } },
        ],
      },
    ]
    expect(hasVisualParts(messages)).toBe(false)
  })
})

describe('modelForMessages', () => {
  it('selects the base model without visual parts', () => {
    expect(modelForMessages([{ role: 'user', content: 'hi' }])).toBe(MODEL)
  })

  it('selects the vision model with visual parts', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: [{ type: 'image', image: 'aGVsbG8=' }] },]
    expect(modelForMessages(messages)).toBe(VISION_MODEL)
  })
})
