import { gateway, wrapLanguageModel } from 'ai'
import type { GatewayModelId } from 'ai'
import type { LanguageModelV3, LanguageModelV3Middleware, LanguageModelV3StreamPart } from '@ai-sdk/provider'
import type { RequestLogger } from '../types'

/**
 * Shape of the `ai` field written to the wide event.
 */
export interface AIEventData {
  calls: number
  model: string
  models?: string[]
  provider: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
  finishReason?: string
  toolCalls?: string[]
  steps?: number
  msToFirstChunk?: number
  msToFinish?: number
  tokensPerSecond?: number
  error?: string
}

export interface AILogger {
  /**
   * Wrap a language model with evlog middleware.
   * All `generateText`, `streamText`, `generateObject`, and `streamObject` calls
   * using the wrapped model are captured automatically into the wide event.
   *
   * Accepts a `LanguageModelV3` object or a model string (e.g. `'anthropic/claude-sonnet-4.6'`).
   * Strings are resolved via the AI SDK gateway.
   *
   * @example
   * ```ts
   * const ai = createAILogger(log)
   * const model = ai.wrap('anthropic/claude-sonnet-4.6')
   *
   * // Also accepts a model object
   * const model = ai.wrap(anthropic('claude-sonnet-4.6'))
   * ```
   */
  wrap: (model: LanguageModelV3 | GatewayModelId) => LanguageModelV3

  /**
   * Manually capture token usage from an `embed()` or `embedMany()` result.
   * Embedding models use a different type than language models, so they
   * cannot be wrapped with middleware.
   *
   * @example
   * ```ts
   * const { embedding, usage } = await embed({ model: embeddingModel, value: query })
   * ai.captureEmbed({ usage })
   * ```
   */
  captureEmbed: (result: { usage: { tokens: number } }) => void
}

interface UsageAccumulator {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
}

function addUsage(
  acc: UsageAccumulator,
  usage: {
    inputTokens: { total: number | undefined, cacheRead?: number | undefined, cacheWrite?: number | undefined }
    outputTokens: { total: number | undefined, reasoning?: number | undefined }
  },
): void {
  acc.inputTokens += usage.inputTokens.total ?? 0
  acc.outputTokens += usage.outputTokens.total ?? 0
  acc.cacheReadTokens += usage.inputTokens.cacheRead ?? 0
  acc.cacheWriteTokens += usage.inputTokens.cacheWrite ?? 0
  acc.reasoningTokens += usage.outputTokens.reasoning ?? 0
}

/**
 * When using `gateway('google/gemini-3-flash')`, the model object has
 * `provider: 'gateway'` and `modelId: 'google/gemini-3-flash'`.
 * This extracts the real provider and model name from the modelId.
 */
function resolveProviderAndModel(provider: string, modelId: string): { provider: string, model: string } {
  if (provider !== 'gateway' || !modelId.includes('/')) {
    return { provider, model: modelId }
  }
  const slashIndex = modelId.indexOf('/')
  return {
    provider: modelId.slice(0, slashIndex),
    model: modelId.slice(slashIndex + 1),
  }
}

/**
 * Create an AI logger that captures AI SDK data into the wide event.
 *
 * Uses model middleware (`wrapLanguageModel`) to transparently intercept
 * all LLM calls. `onFinish` and `onStepFinish` remain free for user code.
 *
 * @example
 * ```ts
 * import { createAILogger } from 'evlog/ai'
 *
 * const log = useLogger(event)
 * const ai = createAILogger(log)
 * const model = ai.wrap('anthropic/claude-sonnet-4.6')
 *
 * const result = streamText({
 *   model,
 *   messages,
 *   onFinish: ({ text }) => saveConversation(text),
 * })
 * ```
 */
export function createAILogger(log: RequestLogger): AILogger {
  let calls = 0
  let steps = 0
  const usage: UsageAccumulator = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
  }
  const models: string[] = []
  const providers: string[] = []
  const allToolCalls: string[] = []
  let lastFinishReason: string | undefined
  let lastMsToFirstChunk: number | undefined
  let lastMsToFinish: number | undefined
  let lastError: string | undefined

  function flush(): void {
    const uniqueModels = [...new Set(models)]
    const lastModel = models[models.length - 1]
    const lastProvider = providers[providers.length - 1]

    const data: Partial<AIEventData> & { calls: number, inputTokens: number, outputTokens: number, totalTokens: number } = {
      calls,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
    }

    if (lastModel) data.model = lastModel
    if (lastProvider) data.provider = lastProvider
    if (uniqueModels.length > 1) data.models = uniqueModels
    if (usage.cacheReadTokens > 0) data.cacheReadTokens = usage.cacheReadTokens
    if (usage.cacheWriteTokens > 0) data.cacheWriteTokens = usage.cacheWriteTokens
    if (usage.reasoningTokens > 0) data.reasoningTokens = usage.reasoningTokens
    if (lastFinishReason) data.finishReason = lastFinishReason
    if (allToolCalls.length > 0) data.toolCalls = [...allToolCalls]
    if (steps > 1) data.steps = steps
    if (lastMsToFirstChunk !== undefined) data.msToFirstChunk = lastMsToFirstChunk
    if (lastMsToFinish !== undefined) {
      data.msToFinish = lastMsToFinish
      if (usage.outputTokens > 0 && lastMsToFinish > 0) {
        data.tokensPerSecond = Math.round((usage.outputTokens / lastMsToFinish) * 1000)
      }
    }
    if (lastError) data.error = lastError

    log.set({ ai: data } as Record<string, unknown>)
  }

  function recordModel(provider: string, modelId: string, responseModelId?: string): void {
    const resolved = resolveProviderAndModel(provider, responseModelId ?? modelId)
    models.push(resolved.model)
    providers.push(resolved.provider)
  }

  const middleware: LanguageModelV3Middleware = {
    wrapGenerate: async ({ doGenerate, model }) => {
      try {
        const result = await doGenerate()

        calls++
        steps++
        addUsage(usage, result.usage)
        recordModel(model.provider, model.modelId, result.response?.modelId)
        lastFinishReason = result.finishReason.unified

        for (const item of result.content) {
          if (item.type === 'tool-call') {
            allToolCalls.push(item.toolName)
          }
        }

        flush()
        return result
      } catch (error) {
        calls++
        steps++
        recordModel(model.provider, model.modelId)
        lastFinishReason = 'error'
        lastError = error instanceof Error ? error.message : String(error)
        flush()
        throw error
      }
    },

    wrapStream: async ({ doStream, model }) => {
      const streamStart = Date.now()
      let firstChunkTime: number | undefined

      let streamUsage: UsageAccumulator | undefined
      let streamFinishReason: string | undefined
      let streamModelId: string | undefined
      const streamToolCalls: string[] = []
      let streamError: string | undefined

      let doStreamResult: Awaited<ReturnType<typeof doStream>>
      try {
        doStreamResult = await doStream()
      } catch (error) {
        calls++
        steps++
        recordModel(model.provider, model.modelId)
        lastFinishReason = 'error'
        lastError = error instanceof Error ? error.message : String(error)
        flush()
        throw error
      }

      const { stream, ...rest } = doStreamResult

      const transformStream = new TransformStream<
        LanguageModelV3StreamPart,
        LanguageModelV3StreamPart
      >({
        transform(chunk, controller) {
          if (!firstChunkTime && chunk.type === 'text-delta') {
            firstChunkTime = Date.now()
          }

          if (chunk.type === 'tool-input-start') {
            streamToolCalls.push(chunk.toolName)
          }

          if (chunk.type === 'finish') {
            streamUsage = {
              inputTokens: chunk.usage.inputTokens.total ?? 0,
              outputTokens: chunk.usage.outputTokens.total ?? 0,
              cacheReadTokens: chunk.usage.inputTokens.cacheRead ?? 0,
              cacheWriteTokens: chunk.usage.inputTokens.cacheWrite ?? 0,
              reasoningTokens: chunk.usage.outputTokens.reasoning ?? 0,
            }
            streamFinishReason = chunk.finishReason.unified
          }

          if (chunk.type === 'response-metadata' && 'modelId' in chunk && chunk.modelId) {
            streamModelId = chunk.modelId as string
          }

          if (chunk.type === 'error') {
            streamError = chunk.error instanceof Error ? chunk.error.message : String(chunk.error)
          }

          controller.enqueue(chunk)
        },

        flush() {
          calls++
          steps++

          if (streamUsage) {
            usage.inputTokens += streamUsage.inputTokens
            usage.outputTokens += streamUsage.outputTokens
            usage.cacheReadTokens += streamUsage.cacheReadTokens
            usage.cacheWriteTokens += streamUsage.cacheWriteTokens
            usage.reasoningTokens += streamUsage.reasoningTokens
          }

          recordModel(model.provider, model.modelId, streamModelId)
          lastFinishReason = streamFinishReason

          for (const name of streamToolCalls) {
            allToolCalls.push(name)
          }

          if (firstChunkTime) {
            lastMsToFirstChunk = firstChunkTime - streamStart
          }
          lastMsToFinish = Date.now() - streamStart

          if (streamError) lastError = streamError

          flush()
        },
      })

      return {
        stream: stream.pipeThrough(transformStream),
        ...rest,
      }
    },
  }

  return {
    wrap: (model: LanguageModelV3 | GatewayModelId) => {
      const resolved = typeof model === 'string' ? gateway(model) : model
      return wrapLanguageModel({ model: resolved, middleware })
    },

    captureEmbed: (result: { usage: { tokens: number } }) => {
      calls++
      usage.inputTokens += result.usage.tokens
      flush()
    },
  }
}
