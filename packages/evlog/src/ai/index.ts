import { gateway, wrapLanguageModel, bindTelemetryIntegration } from 'ai'
import type { GatewayModelId, TelemetryIntegration, OnStartEvent, OnToolCallFinishEvent, OnFinishEvent } from 'ai'
import type { LanguageModelV3, LanguageModelV3Middleware, LanguageModelV3StreamPart } from '@ai-sdk/provider'
import type { RequestLogger } from '../types'

/**
 * Fine-grained control over tool call input capture.
 */
export interface ToolInputsOptions {
  /**
   * Max character length for the stringified input JSON.
   * Inputs exceeding this limit are truncated with a `…` suffix.
   */
  maxLength?: number
  /**
   * Custom transform applied to each captured input before storing.
   * Receives the parsed input and tool name; return value is stored.
   * Runs before `maxLength` truncation.
   */
  transform?: (input: unknown, toolName: string) => unknown
}

/**
 * Pricing entry for a single model: cost per 1 million tokens in dollars.
 */
export interface ModelCost {
  input: number
  output: number
}

/**
 * Options for `createAILogger` and `createAIMiddleware`.
 */
export interface AILoggerOptions {
  /**
   * When enabled, `toolCalls` contains `{ name, input }` objects instead of plain tool name strings.
   * Opt-in because inputs can be large and may contain sensitive data.
   *
   * - `true` — capture all inputs as-is
   * - `{ maxLength, transform }` — capture with truncation or custom transform
   * @default false
   */
  toolInputs?: boolean | ToolInputsOptions
  /**
   * Pricing map for estimating request cost.
   * Keys are model IDs (e.g. `'claude-sonnet-4.6'`, `'gpt-4o'`), values are
   * `{ input, output }` in dollars per 1M tokens.
   *
   * When provided, the wide event includes `ai.estimatedCost` (in dollars).
   *
   * @example
   * ```ts
   * const ai = createAILogger(log, {
   *   cost: {
   *     'claude-sonnet-4.6': { input: 3, output: 15 },
   *     'gpt-4o': { input: 2.5, output: 10 },
   *   },
   * })
   * ```
   */
  cost?: Record<string, ModelCost>
}

/**
 * Per-step token usage breakdown for multi-step agent runs.
 */
export interface AIStepUsage {
  model: string
  inputTokens: number
  outputTokens: number
  toolCalls?: string[]
}

/**
 * Tool execution detail captured via `TelemetryIntegration`.
 */
export interface AIToolExecution {
  name: string
  durationMs: number
  success: boolean
  error?: string
}

/**
 * Embedding metadata captured via `captureEmbed`.
 */
export interface AIEmbeddingData {
  model?: string
  tokens: number
  dimensions?: number
  count?: number
}

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
  toolCalls?: string[] | Array<{ name: string, input: unknown }>
  responseId?: string
  steps?: number
  stepsUsage?: AIStepUsage[]
  msToFirstChunk?: number
  msToFinish?: number
  tokensPerSecond?: number
  error?: string
  tools?: AIToolExecution[]
  totalDurationMs?: number
  embedding?: AIEmbeddingData
  estimatedCost?: number
}

export interface AILogger {
  /**
   * Wrap a language model with evlog middleware.
   * All `generateText` and `streamText` calls using the wrapped model
   * are captured automatically into the wide event.
   *
   * Accepts a `LanguageModelV3` object or a model string (e.g. `'anthropic/claude-sonnet-4.6'`).
   * Strings are resolved via the AI SDK gateway.
   *
   * Also works with pre-wrapped models (e.g. from supermemory, guardrails):
   * `ai.wrap(withSupermemory(base, orgId))` composes correctly.
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
   *
   * // With model info (v2)
   * ai.captureEmbed({ usage, model: 'text-embedding-3-small', dimensions: 1536 })
   *
   * // After embedMany
   * ai.captureEmbed({ usage, count: texts.length })
   * ```
   */
  captureEmbed: (result: {
    usage: { tokens: number }
    model?: string
    dimensions?: number
    count?: number
  }) => void

  /**
   * Internal accumulator state exposed for `createEvlogIntegration` to share.
   * @internal
   */
  _state: AccumulatorState
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
 * Create the evlog AI middleware that captures AI SDK data into a wide event.
 *
 * Use this when you need explicit middleware composition with other wrappers
 * (e.g. supermemory, guardrails). For most cases, use `createAILogger` instead.
 *
 * Note: `captureEmbed` is not available with the raw middleware — use
 * `createAILogger` if you need embedding capture.
 *
 * @example Nuxt API route with supermemory
 * ```ts
 * import { createAIMiddleware } from 'evlog/ai'
 * import { wrapLanguageModel } from 'ai'
 *
 * export default defineEventHandler(async (event) => {
 *   const log = useLogger(event)
 *
 *   const model = wrapLanguageModel({
 *     model: withSupermemory(base, orgId),
 *     middleware: [createAIMiddleware(log, { toolInputs: true })],
 *   })
 * })
 * ```
 */
export function createAIMiddleware(log: RequestLogger, options?: AILoggerOptions): LanguageModelV3Middleware {
  return buildMiddleware(log, options)
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
 *
 * @example Capture tool call inputs
 * ```ts
 * const ai = createAILogger(log, { toolInputs: true })
 * ```
 */
export function createAILogger(log: RequestLogger, options?: AILoggerOptions): AILogger {
  const state = createAccumulatorState(options)
  state._log = log
  const middleware = buildMiddlewareFromState(log, state)

  return {
    wrap: (model: LanguageModelV3 | GatewayModelId) => {
      const resolved = typeof model === 'string' ? gateway(model) : model
      return wrapLanguageModel({ model: resolved, middleware })
    },

    captureEmbed: (result: {
      usage: { tokens: number }
      model?: string
      dimensions?: number
      count?: number
    }) => {
      state.calls++
      state.usage.inputTokens += result.usage.tokens
      state.embedding = {
        tokens: (state.embedding?.tokens ?? 0) + result.usage.tokens,
        ...(result.model ? { model: result.model } : state.embedding?.model ? { model: state.embedding.model } : {}),
        ...(result.dimensions ? { dimensions: result.dimensions } : state.embedding?.dimensions ? { dimensions: state.embedding.dimensions } : {}),
        ...(result.count ? { count: (state.embedding?.count ?? 0) + result.count } : state.embedding?.count ? { count: state.embedding.count } : {}),
      }
      flushState(log, state)
    },

    _state: state,
  }
}

interface AccumulatorState {
  calls: number
  steps: number
  usage: UsageAccumulator
  models: string[]
  lastProvider: string | undefined
  allToolCalls: string[]
  allToolCallInputs: Array<{ name: string, input: unknown }>
  stepsUsage: AIStepUsage[]
  lastFinishReason: string | undefined
  lastMsToFirstChunk: number | undefined
  lastMsToFinish: number | undefined
  lastError: string | undefined
  lastResponseId: string | undefined
  toolInputs: boolean
  toolInputsOptions: ToolInputsOptions | undefined
  toolExecutions: AIToolExecution[]
  generationStartTime: number | undefined
  totalDurationMs: number | undefined
  embedding: AIEmbeddingData | undefined
  costMap: Record<string, ModelCost> | undefined
  /** @internal Logger reference for integration flush */
  _log?: RequestLogger
}

function resolveToolInputs(raw?: boolean | ToolInputsOptions): { enabled: boolean, options: ToolInputsOptions | undefined } {
  if (!raw) return { enabled: false, options: undefined }
  if (raw === true) return { enabled: true, options: undefined }
  return { enabled: true, options: raw }
}

function processToolInput(input: unknown, toolName: string, options: ToolInputsOptions | undefined): unknown {
  let value = input
  if (options?.transform) {
    value = options.transform(value, toolName)
  }
  if (options?.maxLength) {
    const str = typeof value === 'string' ? value : JSON.stringify(value)
    if (str.length > options.maxLength) {
      return `${str.slice(0, options.maxLength)}…`
    }
  }
  return value
}

function createAccumulatorState(options?: AILoggerOptions): AccumulatorState {
  const { enabled, options: captureOpts } = resolveToolInputs(options?.toolInputs)
  return {
    calls: 0,
    steps: 0,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    },
    models: [],
    lastProvider: undefined,
    allToolCalls: [],
    allToolCallInputs: [],
    stepsUsage: [],
    lastFinishReason: undefined,
    lastMsToFirstChunk: undefined,
    lastMsToFinish: undefined,
    lastError: undefined,
    lastResponseId: undefined,
    toolInputs: enabled,
    toolInputsOptions: captureOpts,
    toolExecutions: [],
    generationStartTime: undefined,
    totalDurationMs: undefined,
    embedding: undefined,
    costMap: options?.cost,
  }
}

function computeEstimatedCost(state: AccumulatorState): number | undefined {
  if (!state.costMap) return undefined
  const lastModel = state.models[state.models.length - 1]
  if (!lastModel) return undefined
  const pricing = state.costMap[lastModel]
  if (!pricing) return undefined
  const inputCost = (state.usage.inputTokens / 1_000_000) * pricing.input
  const outputCost = (state.usage.outputTokens / 1_000_000) * pricing.output
  const total = inputCost + outputCost
  return total > 0 ? Math.round(total * 1_000_000) / 1_000_000 : undefined
}

function flushState(log: RequestLogger, state: AccumulatorState): void {
  const uniqueModels = [...new Set(state.models)]
  const lastModel = state.models[state.models.length - 1]

  const data: Partial<AIEventData> & { calls: number, inputTokens: number, outputTokens: number, totalTokens: number } = {
    calls: state.calls,
    inputTokens: state.usage.inputTokens,
    outputTokens: state.usage.outputTokens,
    totalTokens: state.usage.inputTokens + state.usage.outputTokens,
  }

  if (lastModel) data.model = lastModel
  if (state.lastProvider) data.provider = state.lastProvider
  if (uniqueModels.length > 1) data.models = uniqueModels
  if (state.usage.cacheReadTokens > 0) data.cacheReadTokens = state.usage.cacheReadTokens
  if (state.usage.cacheWriteTokens > 0) data.cacheWriteTokens = state.usage.cacheWriteTokens
  if (state.usage.reasoningTokens > 0) data.reasoningTokens = state.usage.reasoningTokens
  if (state.lastFinishReason) data.finishReason = state.lastFinishReason
  if (state.toolInputs && state.allToolCallInputs.length > 0) {
    data.toolCalls = [...state.allToolCallInputs]
  } else if (state.allToolCalls.length > 0) {
    data.toolCalls = [...state.allToolCalls]
  }
  if (state.lastResponseId) data.responseId = state.lastResponseId
  if (state.steps > 1) {
    data.steps = state.steps
    data.stepsUsage = [...state.stepsUsage]
  }
  if (state.lastMsToFirstChunk !== undefined) data.msToFirstChunk = state.lastMsToFirstChunk
  if (state.lastMsToFinish !== undefined) {
    data.msToFinish = state.lastMsToFinish
    if (state.usage.outputTokens > 0 && state.lastMsToFinish > 0) {
      data.tokensPerSecond = Math.round((state.usage.outputTokens / state.lastMsToFinish) * 1000)
    }
  }
  if (state.lastError) data.error = state.lastError
  if (state.toolExecutions.length > 0) data.tools = [...state.toolExecutions]
  if (state.totalDurationMs !== undefined) data.totalDurationMs = state.totalDurationMs
  if (state.embedding) data.embedding = { ...state.embedding }
  const cost = computeEstimatedCost(state)
  if (cost !== undefined) data.estimatedCost = cost

  log.set({ ai: data } as Record<string, unknown>)
}

function recordModel(state: AccumulatorState, provider: string, modelId: string, responseModelId?: string): void {
  const resolved = resolveProviderAndModel(provider, responseModelId ?? modelId)
  state.models.push(resolved.model)
  state.lastProvider = resolved.provider
}

function safeParseJSON(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    return input
  }
}

function recordError(log: RequestLogger, state: AccumulatorState, model: { provider: string, modelId: string }, error: unknown): void {
  state.calls++
  state.steps++
  recordModel(state, model.provider, model.modelId)
  state.lastFinishReason = 'error'
  state.lastError = error instanceof Error ? error.message : String(error)

  const resolved = resolveProviderAndModel(model.provider, model.modelId)
  state.stepsUsage.push({
    model: resolved.model,
    inputTokens: 0,
    outputTokens: 0,
  })

  flushState(log, state)
}

function buildMiddleware(log: RequestLogger, options?: AILoggerOptions): LanguageModelV3Middleware {
  const state = createAccumulatorState(options)
  state._log = log
  return buildMiddlewareFromState(log, state)
}

function buildMiddlewareFromState(log: RequestLogger, state: AccumulatorState): LanguageModelV3Middleware {
  return {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate, model }) => {
      try {
        const result = await doGenerate()

        state.calls++
        state.steps++
        addUsage(state.usage, result.usage)
        recordModel(state, model.provider, model.modelId, result.response?.modelId)
        state.lastFinishReason = result.finishReason.unified

        if (result.response?.id) {
          state.lastResponseId = result.response.id
        }

        const stepToolCalls: string[] = []
        for (const item of result.content) {
          if (item.type === 'tool-call') {
            state.allToolCalls.push(item.toolName)
            stepToolCalls.push(item.toolName)
            if (state.toolInputs) {
              const raw = typeof item.input === 'string' ? safeParseJSON(item.input) : item.input
              state.allToolCallInputs.push({
                name: item.toolName,
                input: processToolInput(raw, item.toolName, state.toolInputsOptions),
              })
            }
          }
        }

        const resolvedModel = resolveProviderAndModel(model.provider, result.response?.modelId ?? model.modelId)
        state.stepsUsage.push({
          model: resolvedModel.model,
          inputTokens: result.usage.inputTokens.total ?? 0,
          outputTokens: result.usage.outputTokens.total ?? 0,
          ...(stepToolCalls.length > 0 ? { toolCalls: stepToolCalls } : {}),
        })

        flushState(log, state)
        return result
      } catch (error) {
        recordError(log, state, model, error)
        throw error
      }
    },

    wrapStream: async ({ doStream, model }) => {
      const streamStart = Date.now()
      let firstChunkTime: number | undefined

      let streamUsage: UsageAccumulator | undefined
      let streamFinishReason: string | undefined
      let streamModelId: string | undefined
      let streamResponseId: string | undefined
      const streamToolCalls: string[] = []
      const streamToolInputBuffers = new Map<string, { name: string, chunks: string[] }>()
      let streamError: string | undefined

      let doStreamResult: Awaited<ReturnType<typeof doStream>>
      try {
        doStreamResult = await doStream()
      } catch (error) {
        recordError(log, state, model, error)
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
            if (state.toolInputs) {
              streamToolInputBuffers.set(chunk.id, { name: chunk.toolName, chunks: [] })
            }
          }

          if (chunk.type === 'tool-input-delta' && state.toolInputs) {
            const buffer = streamToolInputBuffers.get(chunk.id)
            if (buffer) {
              buffer.chunks.push(chunk.delta)
            }
          }

          if (chunk.type === 'tool-input-end' && state.toolInputs) {
            const buffer = streamToolInputBuffers.get(chunk.id)
            if (buffer) {
              const raw = safeParseJSON(buffer.chunks.join(''))
              state.allToolCallInputs.push({
                name: buffer.name,
                input: processToolInput(raw, buffer.name, state.toolInputsOptions),
              })
              streamToolInputBuffers.delete(chunk.id)
            }
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

          if (chunk.type === 'response-metadata') {
            if (chunk.modelId) streamModelId = chunk.modelId
            if (chunk.id) streamResponseId = chunk.id
          }

          if (chunk.type === 'error') {
            streamError = chunk.error instanceof Error ? chunk.error.message : String(chunk.error)
          }

          controller.enqueue(chunk)
        },

        flush() {
          state.calls++
          state.steps++

          if (streamUsage) {
            state.usage.inputTokens += streamUsage.inputTokens
            state.usage.outputTokens += streamUsage.outputTokens
            state.usage.cacheReadTokens += streamUsage.cacheReadTokens
            state.usage.cacheWriteTokens += streamUsage.cacheWriteTokens
            state.usage.reasoningTokens += streamUsage.reasoningTokens
          }

          recordModel(state, model.provider, model.modelId, streamModelId)
          state.lastFinishReason = streamFinishReason

          state.allToolCalls.push(...streamToolCalls)

          if (streamResponseId) {
            state.lastResponseId = streamResponseId
          }

          if (firstChunkTime) {
            state.lastMsToFirstChunk = firstChunkTime - streamStart
          }
          state.lastMsToFinish = Date.now() - streamStart

          if (streamError) state.lastError = streamError

          const resolvedModel = resolveProviderAndModel(model.provider, streamModelId ?? model.modelId)
          state.stepsUsage.push({
            model: resolvedModel.model,
            inputTokens: streamUsage?.inputTokens ?? 0,
            outputTokens: streamUsage?.outputTokens ?? 0,
            ...(streamToolCalls.length > 0 ? { toolCalls: [...streamToolCalls] } : {}),
          })

          flushState(log, state)
        },
      })

      return {
        stream: stream.pipeThrough(transformStream),
        ...rest,
      }
    },
  }
}

/**
 * Create an AI SDK `TelemetryIntegration` that captures tool execution
 * timing, errors, and total generation wall time into the wide event.
 *
 * Complements the middleware-based `createAILogger`: the middleware captures
 * token usage and streaming metrics at the model level, while the integration
 * captures application-level lifecycle events (tool execution, total duration).
 *
 * When passed an `AILogger`, shares its accumulator so both paths write to
 * the same `ai.*` field. Can also be used standalone with a `RequestLogger`.
 *
 * @example Combined with middleware (recommended)
 * ```ts
 * import { createAILogger, createEvlogIntegration } from 'evlog/ai'
 *
 * const log = useLogger(event)
 * const ai = createAILogger(log)
 *
 * const result = await generateText({
 *   model: ai.wrap('anthropic/claude-sonnet-4.6'),
 *   tools: { getWeather },
 *   experimental_telemetry: {
 *     isEnabled: true,
 *     integrations: [createEvlogIntegration(ai)],
 *   },
 * })
 * ```
 *
 * @example Standalone (no middleware wrapping)
 * ```ts
 * import { createEvlogIntegration } from 'evlog/ai'
 *
 * const integration = createEvlogIntegration(log)
 *
 * const result = await generateText({
 *   model: openai('gpt-4o'),
 *   experimental_telemetry: {
 *     isEnabled: true,
 *     integrations: [integration],
 *   },
 * })
 * ```
 */
export function createEvlogIntegration(
  logOrAi: RequestLogger | AILogger,
  options?: AILoggerOptions,
): TelemetryIntegration {
  let log: RequestLogger
  let state: AccumulatorState

  if ('_state' in logOrAi && logOrAi._state) {
    state = logOrAi._state
    log = state._log!
  } else {
    log = logOrAi as RequestLogger
    state = createAccumulatorState(options)
    state._log = log
  }

  class EvlogIntegration implements TelemetryIntegration {

    onStart(_event: OnStartEvent) {
      state.generationStartTime = Date.now()
    }

    onToolCallFinish(event: OnToolCallFinishEvent) {
      const execution: AIToolExecution = {
        name: (event.toolCall as { toolName: string }).toolName,
        durationMs: event.durationMs,
        success: event.success,
      }
      if (!event.success && event.error) {
        execution.error = event.error instanceof Error ? event.error.message : String(event.error)
      }
      state.toolExecutions.push(execution)
    }

    onFinish(_event: OnFinishEvent) {
      if (state.generationStartTime) {
        state.totalDurationMs = Date.now() - state.generationStartTime
      }
      flushState(log, state)
    }
  
  }

  return bindTelemetryIntegration(new EvlogIntegration())
}
