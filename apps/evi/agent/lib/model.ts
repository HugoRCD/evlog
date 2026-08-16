import type { ModelMessage } from 'ai'

/** `EVI_MODEL` overrides the model, to run the eval suite on a candidate. */
export const MODEL = process.env.EVI_MODEL || 'deepseek/deepseek-v4-flash'

/**
 * Vision fallback for sessions carrying image parts, since the base model is
 * text-only. `EVI_VISION_MODEL` overrides it the same way `EVI_MODEL` does.
 */
export const VISION_MODEL = process.env.EVI_VISION_MODEL || 'alibaba/qwen3.7-flash'

/**
 * Whether the conversation history carries content the base model cannot
 * ingest: an image or file part in a user message (an inbound attachment), or
 * a binary content part in a tool result (a fetched image, a screenshot).
 * Compaction replaces those payloads with text stubs, so a long session
 * naturally drops back to text-only.
 */
export function hasVisualParts(messages: readonly ModelMessage[]): boolean {
  for (const message of messages) {
    if (message.role === 'user' && Array.isArray(message.content)) {
      if (message.content.some((part) => part.type === 'image' || part.type === 'file')) return true
    }
    if (message.role === 'tool') {
      for (const part of message.content) {
        if (part.type !== 'tool-result' || part.output.type !== 'content') continue
        if (part.output.value.some((item) => item.type !== 'text')) return true
      }
    }
  }
  return false
}

/** The base model, or the vision fallback while visual parts sit in history. */
export function modelForMessages(messages: readonly ModelMessage[]): string {
  return hasVisualParts(messages) ? VISION_MODEL : MODEL
}
