import type { ModelMessage } from 'ai'
import { describe, expect, it } from 'vitest'
import { MODEL, modelForMessages, VISION_MODEL } from './model'

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
})
