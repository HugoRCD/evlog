import type { LanguageModel, LanguageModelMiddleware, ModelMessage } from 'ai'
import { gateway, wrapLanguageModel } from 'ai'

/** `EVI_MODEL` overrides the model, to run the eval suite on a candidate. */
export const MODEL = process.env.EVI_MODEL || 'deepseek/deepseek-v4-flash'

/**
 * Vision fallback for turns carrying image parts, since the base model is
 * text-only. `EVI_VISION_MODEL` overrides it the same way `EVI_MODEL` does.
 */
export const VISION_MODEL = process.env.EVI_VISION_MODEL || 'alibaba/qwen3.7-flash'

function messageHasVisualParts(message: ModelMessage): boolean {
  if (message.role === 'user' && Array.isArray(message.content)) {
    if (message.content.some((part) => part.type === 'image' || part.type === 'file')) return true
  }
  if (message.role === 'tool') {
    for (const part of message.content) {
      if (part.type !== 'tool-result' || part.output.type !== 'content') continue
      if (part.output.value.some((item) => item.type !== 'text')) return true
    }
  }
  return false
}

/**
 * Whether the history carries content the base model cannot ingest: an image
 * or file part in a user message (an inbound attachment), or a binary content
 * part in a tool result (a fetched image, a screenshot).
 */
export function hasVisualParts(messages: readonly ModelMessage[]): boolean {
  return messages.some(messageHasVisualParts)
}

/** Index of the user message that opened the current turn, or -1 when the history has none. */
function currentTurnStart(messages: readonly ModelMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') return i
  }
  return -1
}

/**
 * The vision fallback runs only while the current turn carries visual parts:
 * an inbound attachment, or a binary tool result produced during the turn.
 * Images from earlier turns never hold the session on the fallback; the next
 * turn returns to the base model with those parts stubbed (`modelForStep`).
 */
export function modelForMessages(messages: readonly ModelMessage[]): string {
  const start = currentTurnStart(messages)
  return hasVisualParts(start === -1 ? messages : messages.slice(start)) ? VISION_MODEL : MODEL
}

type StepParams = Awaited<ReturnType<NonNullable<LanguageModelMiddleware['transformParams']>>>
/** The provider-format prompt a middleware sees, exported for the colocated test. */
export type ProviderPrompt = StepParams['prompt']

const STUB_TEXT = '[image removed from history after its turn; ask for it again if it is still needed]'

/**
 * Replaces visual payloads in a provider prompt with text stubs, so the
 * text-only base model accepts a history whose earlier turns carried images.
 * Selection guarantees the current turn itself has none.
 */
export function stubVisualPrompt(prompt: ProviderPrompt): ProviderPrompt {
  return prompt.map((message) => {
    if (message.role === 'user') {
      return {
        ...message,
        content: message.content.map((part) => part.type === 'file' ? { type: 'text' as const, text: STUB_TEXT } : part),
      }
    }
    if (message.role === 'assistant' || message.role === 'tool') {
      return {
        ...message,
        content: message.content.map((part) => {
          if (part.type === 'file') return { type: 'text' as const, text: STUB_TEXT }
          if (part.type !== 'tool-result' || part.output.type !== 'content') return part
          return {
            ...part,
            output: {
              ...part.output,
              value: part.output.value.map((item) => item.type === 'text' ? item : { type: 'text' as const, text: STUB_TEXT }),
            },
          }
        }),
      } as typeof message
    }
    return message
  })
}

const stubVisualPartsMiddleware: LanguageModelMiddleware = {
  transformParams: ({ params }) => Promise.resolve({ ...params, prompt: stubVisualPrompt(params.prompt) }),
}

/**
 * Step selection: the vision model while the current turn carries visual
 * parts, the plain base model id on a clean history, and the base model
 * wrapped to stub earlier turns' images otherwise. Live model objects are
 * only valid from `step.started`, so only that scope may call this.
 */
export function modelForStep(messages: readonly ModelMessage[]): string | LanguageModel {
  const model = modelForMessages(messages)
  if (model === VISION_MODEL) return model
  if (!hasVisualParts(messages)) return model
  return wrapLanguageModel({ model: gateway(MODEL), middleware: stubVisualPartsMiddleware })
}
