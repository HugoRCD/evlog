import { defineHook, type HookContext, type HookDefinition } from 'eve/hooks'
import type { AuditableLogger } from '../audit'
import type { AIToolExecution, AIEventData } from '../ai/index'
import { initLogger, isLoggerLocked } from '../logger'
import type { LoggerConfig } from '../types'
import type { BaseEvlogOptions, MiddlewareLoggerOptions } from '../shared/middleware'
import { createMiddlewareLogger } from '../shared/middleware'

/** Options for {@link defineEvlogHook}. */
export interface EvlogEveOptions extends BaseEvlogOptions {
  /** Passed to {@link initLogger} on the first hook invocation. */
  init?: LoggerConfig
  /**
   * When `true` (default), user message content from `message.received` is
   * omitted from the wide event. Set to `false` to include a truncated preview.
   */
  redactMessage?: boolean
}

/** Minimal session shape accepted by {@link useTurnLogger}. */
export interface EveTurnSessionContext {
  readonly session: {
    readonly id: string
    readonly turn?: { readonly id?: string }
  }
}

interface TurnAccumulator {
  calls: number
  steps: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  finishReason?: string
  toolExecutions: AIToolExecution[]
}

interface TurnState {
  logger: AuditableLogger
  finish: (opts?: { status?: number; error?: Error }) => Promise<unknown>
  middlewareOptions: MiddlewareLoggerOptions
  accumulator: TurnAccumulator
  sessionId: string
  turnId: string
}

function turnKey(sessionId: string, turnId: string): string {
  return `${sessionId}:${turnId}`
}

function freshAccumulator(): TurnAccumulator {
  return {
    calls: 0,
    steps: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    toolExecutions: [],
  }
}

function buildAiField(state: TurnAccumulator): AIEventData {
  const totalTokens = state.inputTokens + state.outputTokens
  const data: AIEventData = {
    calls: state.calls,
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    totalTokens,
    steps: state.steps,
  }
  if (state.cacheReadTokens > 0) data.cacheReadTokens = state.cacheReadTokens
  if (state.cacheWriteTokens > 0) data.cacheWriteTokens = state.cacheWriteTokens
  if (state.finishReason) data.finishReason = state.finishReason
  if (state.toolExecutions.length > 0) {
    data.tools = state.toolExecutions.map(t => ({ ...t }))
  }
  return data
}

function extractToolName(result: unknown): string {
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>
    if (typeof record.toolName === 'string') return record.toolName
    if (typeof record.name === 'string') return record.name
  }
  return 'unknown'
}

function truncateMessage(message: string, maxLength = 500): string {
  if (message.length <= maxLength) return message
  return `${message.slice(0, maxLength)}…`
}

let initialized = false

function ensureInit(options: EvlogEveOptions): void {
  if (isEveInitialized()) return
  if (!isLoggerLocked()) {
    initLogger(options.init ?? { env: { service: 'eve-agent' } })
  }
  setEveInitialized(true)
  initialized = true
}

/**
 * Access the turn-scoped logger from an eve tool `execute()` handler.
 *
 * Pass the tool context (`ctx`) so evlog can resolve the active session turn.
 * Throws when called outside a turn tracked by {@link defineEvlogHook}.
 *
 * @example
 * ```ts
 * import { useTurnLogger } from 'evlog/eve'
 *
 * export default defineTool({
 *   async execute(input, ctx) {
 *     const log = useTurnLogger(ctx)
 *     log.set({ order: { id: input.orderId } })
 *   },
 * })
 * ```
 */
export function useTurnLogger(ctx?: EveTurnSessionContext): AuditableLogger {
  const sessionId = ctx?.session?.id
  const turnId = ctx?.session?.turn?.id ?? (sessionId ? activeTurnBySession().get(sessionId) : undefined)

  if (!sessionId || !turnId) {
    throw new Error(
      '[evlog] useTurnLogger() was called outside an evlog eve turn. '
      + 'Add agent/hooks/evlog.ts with defineEvlogHook() and pass ctx from the tool handler.',
    )
  }

  const state = turnStates().get(turnKey(sessionId, turnId))
  if (!state) {
    throw new Error(
      '[evlog] useTurnLogger() could not find a logger for the current turn. '
      + 'Ensure defineEvlogHook() is registered and the turn has started.',
    )
  }

  return state.logger
}

interface EveGlobalState {
  turnStates: Map<string, TurnState>
  activeTurnBySession: Map<string, string>
  initialized: boolean
}

const EVE_GLOBAL_STATE = Symbol.for('evlog.eve.state')

function getEveGlobalState(): EveGlobalState {
  const host = globalThis as typeof globalThis & {
    [EVE_GLOBAL_STATE]?: EveGlobalState
  }
  if (!host[EVE_GLOBAL_STATE]) {
    host[EVE_GLOBAL_STATE] = {
      turnStates: new Map(),
      activeTurnBySession: new Map(),
      initialized: false,
    }
  }
  return host[EVE_GLOBAL_STATE]
}

function turnStates(): Map<string, TurnState> {
  return getEveGlobalState().turnStates
}

function activeTurnBySession(): Map<string, string> {
  return getEveGlobalState().activeTurnBySession
}

function isEveInitialized(): boolean {
  return getEveGlobalState().initialized
}

function setEveInitialized(value: boolean): void {
  getEveGlobalState().initialized = value
}


function getOrCreateTurnState(
  sessionId: string,
  turnId: string,
  options: EvlogEveOptions,
  ctx: HookContext,
): TurnState | null {
  const key = turnKey(sessionId, turnId)
  const existing = turnStates().get(key)
  if (existing) return existing

  const path = `/sessions/${sessionId}/turns/${turnId}`
  const middlewareOptions: MiddlewareLoggerOptions = {
    method: 'EVE',
    path,
    requestId: turnId,
    drain: options.drain,
    enrich: options.enrich,
    keep: options.keep,
    redact: options.redact,
    plugins: options.plugins,
    include: options.include,
    exclude: options.exclude,
    routes: options.routes,
  }

  const { logger, finish, skipped } = createMiddlewareLogger(middlewareOptions)
  if (skipped) return null

  const state: TurnState = {
    logger,
    finish,
    middlewareOptions,
    accumulator: freshAccumulator(),
    sessionId,
    turnId,
  }

  logger.set({
    eve: {
      sessionId,
      turnId,
    },
    agent: {
      name: ctx.agent.name,
      ...(ctx.agent.nodeId ? { nodeId: ctx.agent.nodeId } : {}),
    },
    channel: {
      kind: ctx.channel.kind ?? 'unknown',
      ...(ctx.channel.continuationToken
        ? { continuationToken: ctx.channel.continuationToken }
        : {}),
    },
  })

  turnStates().set(key, state)
  activeTurnBySession().set(sessionId, turnId)
  return state
}

function flushAi(state: TurnState): void {
  state.logger.set({ ai: buildAiField(state.accumulator) })
}

async function finishTurn(
  sessionId: string,
  turnId: string,
  opts: { status?: number; error?: Error },
): Promise<void> {
  const key = turnKey(sessionId, turnId)
  const state = turnStates().get(key)
  if (!state) return

  try {
    flushAi(state)
    await state.finish(opts)
  } finally {
    turnStates().delete(key)
    if (activeTurnBySession().get(sessionId) === turnId) {
      activeTurnBySession().delete(sessionId)
    }
  }
}

function runSafe(fn: () => void | Promise<void>): void {
  void (async () => {
    try {
      await fn()
    } catch (err) {
      console.error('[evlog] eve hook handler failed:', err)
    }
  })()
}

/**
 * Create an eve stream hook that emits one evlog wide event per agent turn.
 *
 * Export the result as the default export of `agent/hooks/evlog.ts`. eve
 * auto-discovers hook files; evlog maps turn lifecycle events to a wide event
 * with AI usage, tool executions, and your drain/enrich/keep pipeline.
 *
 * Complements eve Agent Runs and OpenTelemetry — it does not replace them.
 *
 * @example
 * ```ts
 * // agent/hooks/evlog.ts
 * import { defineEvlogHook } from 'evlog/eve'
 * import { createAxiomDrain } from 'evlog/axiom'
 *
 * export default defineEvlogHook({
 *   drain: createAxiomDrain(),
 *   enrich: (ctx) => {
 *     ctx.event.runtime = process.env.VERCEL_REGION
 *   },
 * })
 * ```
 */
export function defineEvlogHook(options: EvlogEveOptions = {}): HookDefinition {
  const redactMessage = options.redactMessage ?? true

  return defineHook({
    events: {
      'turn.started'(event, ctx) {
        try {
          ensureInit(options)
          getOrCreateTurnState(ctx.session.id, event.data.turnId, options, ctx)
          const state = turnStates().get(turnKey(ctx.session.id, event.data.turnId))
          state?.logger.set({
            eve: {
              turnSequence: event.data.sequence,
            },
          })
        } catch (err) {
          console.error('[evlog] eve hook handler failed:', err)
        }
      },

      'message.received'(event, ctx) {
        runSafe(() => {
          const state = turnStates().get(turnKey(ctx.session.id, event.data.turnId))
          if (!state) return
          if (redactMessage) {
            state.logger.set({ message: { receivedRedacted: true } })
          } else {
            state.logger.set({
              message: { received: truncateMessage(event.data.message) },
            })
          }
        })
      },

      'step.completed'(event, ctx) {
        runSafe(() => {
          const state = turnStates().get(turnKey(ctx.session.id, event.data.turnId))
          if (!state) return
          const acc = state.accumulator
          acc.steps += 1
          acc.calls += 1
          acc.finishReason = event.data.finishReason
          const { usage } = event.data
          if (usage) {
            acc.inputTokens += usage.inputTokens ?? 0
            acc.outputTokens += usage.outputTokens ?? 0
            acc.cacheReadTokens += usage.cacheReadTokens ?? 0
            acc.cacheWriteTokens += usage.cacheWriteTokens ?? 0
          }
        })
      },

      'action.result'(event, ctx) {
        runSafe(() => {
          const state = turnStates().get(turnKey(ctx.session.id, event.data.turnId))
          if (!state) return
          const success = event.data.status === 'completed'
          const execution: AIToolExecution = {
            name: extractToolName(event.data.result),
            durationMs: 0,
            success,
          }
          if (!success && event.data.error) {
            execution.error = event.data.error.message
          }
          state.accumulator.toolExecutions.push(execution)
        })
      },

      async 'turn.completed'(event, ctx) {
        try {
          await finishTurn(ctx.session.id, event.data.turnId, { status: 200 })
        } catch (err) {
          console.error('[evlog] eve hook handler failed:', err)
        }
      },

      async 'turn.failed'(event, ctx) {
        try {
          const state = turnStates().get(turnKey(ctx.session.id, event.data.turnId))
          state?.logger.set({
            eve: {
              failure: {
                code: event.data.code,
                message: event.data.message,
                ...(event.data.details ? { details: event.data.details } : {}),
              },
            },
          })
          const error = new Error(event.data.message)
          error.name = event.data.code
          await finishTurn(ctx.session.id, event.data.turnId, { error, status: 500 })
        } catch (err) {
          console.error('[evlog] eve hook handler failed:', err)
        }
      },
    },
  })
}

/** @internal Resets module state between unit tests. */
export function resetEvlogEveForTests(): void {
  turnStates().clear()
  activeTurnBySession().clear()
  setEveInitialized(false)
  initialized = false
  delete (globalThis as typeof globalThis & { [EVE_GLOBAL_STATE]?: EveGlobalState })[EVE_GLOBAL_STATE]
}
