import { AsyncLocalStorage } from 'node:async_hooks'
import { defineHook, type HookContext, type HookDefinition } from 'eve/hooks'
import type { AuditableLogger } from '../audit'
import type { AIToolExecution, AIEventData, ModelCost } from '../ai/index'
import { initLogger, isLoggerInitialized, isLoggerLocked } from '../logger'
import type { LoggerConfig } from '../types'
import type { BaseEvlogOptions, MiddlewareLoggerOptions } from '../shared/middleware'
import { createMiddlewareLogger } from '../shared/middleware'
import {
  bindAsyncLocalStorage,
  clearAsyncLocalStorage,
  patchAsyncLocalStorageEnterWith,
} from '../shared/asyncStorageScope'

const DEFAULT_MAX_SESSIONS = 256

/** Options for {@link defineEvlogHook}. */
export interface EvlogEveOptions extends BaseEvlogOptions {
  /** Passed to {@link initLogger} on the first hook invocation. */
  init?: LoggerConfig
  /**
   * When `true` (default), user message content from `message.received` is
   * omitted from the wide event. Set to `false` to include a truncated preview.
   */
  redactMessage?: boolean
  /**
   * Pricing map for {@link AIEventData.estimatedCost}. Keys are model IDs,
   * values are dollars per 1M tokens — same shape as `evlog/ai`.
   */
  cost?: Record<string, ModelCost>
  /**
   * Model ID used with `cost` when eve stream events do not expose the model
   * name. When `cost` has exactly one entry, that key is used automatically.
   */
  model?: string
  /**
   * Max in-memory sessions for context carry-over and approval state.
   * Oldest sessions are evicted when exceeded. Default `256`.
   */
  maxSessions?: number
}

/** Minimal session shape accepted by {@link useLogger} as a fallback lookup key. */
export interface EveTurnSessionContext {
  readonly session: {
    readonly id: string
    readonly turn?: { readonly id?: string }
  }
}

interface PendingAction {
  toolName: string
  startedAt: number
  turnId: string
}

interface EveApprovalPending {
  toolName: string
  callId: string
}

interface SessionRollup {
  turnCount: number
  lastAccess: number
}

interface EveSubagentRecord {
  callId: string
  name: string
  toolName?: string
  childSessionId?: string
  status: 'called' | 'completed'
  output?: string
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
  subagents: EveSubagentRecord[]
  pausedForInput: boolean
  stepStartedAt?: number
  costMap?: Record<string, ModelCost>
  costModel?: string
}

interface TurnState {
  logger: AuditableLogger
  finish: (opts?: { status?: number; error?: Error }) => Promise<unknown>
  middlewareOptions: MiddlewareLoggerOptions
  accumulator: TurnAccumulator
  sessionId: string
  turnId: string
}

/** Top-level wide-event keys that stay turn-scoped and are not carried across turns. */
const TURN_ONLY_KEYS = new Set([
  'eve',
  'ai',
  'message',
  'method',
  'path',
  'status',
  'duration',
  'level',
  'error',
  'agent',
  'channel',
  'approval',
  'audit',
  'requestId',
  'service',
  'timestamp',
  'traceId',
  'spanId',
])

function turnKey(sessionId: string, turnId: string): string {
  return `${sessionId}:${turnId}`
}

function freshAccumulator(options: EvlogEveOptions): TurnAccumulator {
  return {
    calls: 0,
    steps: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    toolExecutions: [],
    subagents: [],
    pausedForInput: false,
    costMap: options.cost,
    costModel: resolveCostModel(options),
  }
}

function resolveCostModel(options: EvlogEveOptions): string | undefined {
  if (options.model) return options.model
  const keys = options.cost ? Object.keys(options.cost) : []
  if (keys.length === 1) return keys[0]
  return undefined
}

function computeEstimatedCost(state: TurnAccumulator): number | undefined {
  if (!state.costMap || !state.costModel) return undefined
  const pricing = state.costMap[state.costModel]
  if (!pricing) return undefined
  const inputCost = (state.inputTokens / 1_000_000) * pricing.input
  const outputCost = (state.outputTokens / 1_000_000) * pricing.output
  const total = inputCost + outputCost
  return total > 0 ? Math.round(total * 1_000_000) / 1_000_000 : undefined
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
  if (state.costModel) data.model = state.costModel
  if (state.cacheReadTokens > 0) data.cacheReadTokens = state.cacheReadTokens
  if (state.cacheWriteTokens > 0) data.cacheWriteTokens = state.cacheWriteTokens
  if (state.finishReason) data.finishReason = state.finishReason
  const estimatedCost = computeEstimatedCost(state)
  if (estimatedCost !== undefined) data.estimatedCost = estimatedCost
  if (state.toolExecutions.length > 0) {
    data.tools = state.toolExecutions.map(t => ({ ...t }))
  }
  return data
}

function extractToolName(result: unknown): string {
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>
    if (typeof record.toolName === 'string') return record.toolName
    if (typeof record.subagentName === 'string') return record.subagentName
    if (typeof record.name === 'string') return record.name
  }
  return 'unknown'
}

function extractCallId(result: unknown): string | undefined {
  if (result && typeof result === 'object') {
    const { callId } = result as Record<string, unknown>
    if (typeof callId === 'string') return callId
  }
  return undefined
}

function truncateMessage(message: string, maxLength = 500): string {
  if (message.length <= maxLength) return message
  return `${message.slice(0, maxLength)}…`
}

function ensureInit(options: EvlogEveOptions): void {
  const state = getEveGlobalState()
  if (options.maxSessions !== undefined) {
    state.maxSessions = options.maxSessions
  }
  if (isEveInitialized()) return
  if (!isLoggerLocked() && !isLoggerInitialized()) {
    initLogger(options.init ?? { env: { service: 'eve-agent' } })
  }
  setEveInitialized(true)
}

const turnLoggerStorage = new AsyncLocalStorage<AuditableLogger>()
patchAsyncLocalStorageEnterWith(turnLoggerStorage)
const activeTurnLoggers = new WeakSet<AuditableLogger>()

function bindTurnLogger(logger: AuditableLogger): void {
  bindAsyncLocalStorage(turnLoggerStorage, logger)
  activeTurnLoggers.add(logger)
}

function unbindTurnLogger(logger: AuditableLogger): void {
  activeTurnLoggers.delete(logger)
  if (turnLoggerStorage.getStore() === logger) {
    clearAsyncLocalStorage(turnLoggerStorage)
  }
}

function resolveTurnLogger(ctx: EveTurnSessionContext): AuditableLogger {
  const sessionId = ctx.session.id
  const turnId = ctx.session.turn?.id ?? activeTurnBySession().get(sessionId)

  if (!turnId) {
    throw new Error(
      '[evlog] useLogger() could not resolve the active turn. '
      + 'Ensure defineEvlogHook() is registered and the turn has started.',
    )
  }

  const state = turnStates().get(turnKey(sessionId, turnId))
  if (!state) {
    throw new Error(
      '[evlog] useLogger() could not find a logger for the current turn. '
      + 'Ensure defineEvlogHook() is registered and the turn has started.',
    )
  }

  return state.logger
}

/**
 * Turn-scoped logger for eve tool `execute()` handlers.
 *
 * When {@link defineEvlogHook} is registered, the logger is bound via
 * AsyncLocalStorage on `turn.started`. Inside tool handlers, `useLogger()`
 * resolves from ALS when it propagated, otherwise from the sole active turn
 * in the process (typical eve dev). Pass eve tool `ctx` only when multiple
 * sessions are active concurrently.
 *
 * @example
 * ```ts
 * import { useLogger } from 'evlog/eve'
 *
 * export default defineTool({
 *   async execute(input) {
 *     const log = useLogger()
 *     log.set({ order: { id: input.orderId } })
 *   },
 * })
 * ```
 */
function resolveActiveTurnLogger(): AuditableLogger | null {
  const active = activeTurnBySession()
  if (active.size !== 1) return null

  const [sessionId, turnId] = active.entries().next().value!
  return turnStates().get(turnKey(sessionId, turnId))?.logger ?? null
}

export function useLogger(ctx?: EveTurnSessionContext): AuditableLogger {
  const fromStorage = turnLoggerStorage.getStore()
  if (fromStorage && activeTurnLoggers.has(fromStorage)) {
    return fromStorage
  }

  if (ctx?.session?.id) {
    return resolveTurnLogger(ctx)
  }

  const active = resolveActiveTurnLogger()
  if (active) return active

  throw new Error(
    '[evlog] useLogger() was called outside an evlog eve turn. '
    + 'Add agent/hooks/evlog.ts with defineEvlogHook() or pass ctx from the tool handler.',
  )
}

interface EveGlobalState {
  turnStates: Map<string, TurnState>
  activeTurnBySession: Map<string, string>
  sessionSnapshots: Map<string, Record<string, unknown>>
  sessionPendingActions: Map<string, Map<string, PendingAction>>
  sessionApprovals: Map<string, EveApprovalPending[]>
  sessionRollups: Map<string, SessionRollup>
  maxSessions: number
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
      sessionSnapshots: new Map(),
      sessionPendingActions: new Map(),
      sessionApprovals: new Map(),
      sessionRollups: new Map(),
      maxSessions: DEFAULT_MAX_SESSIONS,
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

function sessionSnapshots(): Map<string, Record<string, unknown>> {
  return getEveGlobalState().sessionSnapshots
}

function sessionPendingActions(): Map<string, Map<string, PendingAction>> {
  return getEveGlobalState().sessionPendingActions
}

function sessionApprovals(): Map<string, EveApprovalPending[]> {
  return getEveGlobalState().sessionApprovals
}

function sessionRollups(): Map<string, SessionRollup> {
  return getEveGlobalState().sessionRollups
}

function touchSession(sessionId: string): void {
  const rollups = sessionRollups()
  const rollup = rollups.get(sessionId) ?? { turnCount: 0, lastAccess: 0 }
  rollup.lastAccess = Date.now()
  rollups.set(sessionId, rollup)
  evictStaleSessions()
}

function clearSessionState(sessionId: string): void {
  sessionSnapshots().delete(sessionId)
  sessionRollups().delete(sessionId)
  sessionPendingActions().delete(sessionId)
  sessionApprovals().delete(sessionId)
}

function evictStaleSessions(): void {
  const { maxSessions } = getEveGlobalState()
  const rollups = sessionRollups()
  if (rollups.size <= maxSessions) return

  const oldest = [...rollups.entries()]
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess)
    .slice(0, rollups.size - maxSessions)

  for (const [sessionId] of oldest) {
    if (activeTurnBySession().has(sessionId)) continue
    clearSessionState(sessionId)
  }
}

function pruneEmptySessionMaps(sessionId: string): void {
  const pending = sessionPendingActions().get(sessionId)
  if (pending?.size === 0) sessionPendingActions().delete(sessionId)

  const approvals = sessionApprovals().get(sessionId)
  if (approvals?.length === 0) sessionApprovals().delete(sessionId)
}

function bumpSessionTurnCount(sessionId: string): number {
  touchSession(sessionId)
  const rollup = sessionRollups().get(sessionId)!
  rollup.turnCount += 1
  return rollup.turnCount
}

/** Turn-level label — only set when the turn ends in a non-routine state. */
function derivePhase(
  ctx: Record<string, unknown>,
  accumulator: TurnAccumulator,
  httpStatus: number,
): string | undefined {
  const approval = ctx.approval as { status?: string } | undefined
  if (approval?.status === 'rejected') return 'rejected'
  if (approval?.status === 'pending' || accumulator.pausedForInput) return 'awaiting-approval'
  if (httpStatus >= 400) return 'failed'
  return undefined
}

function getSessionPendingActions(sessionId: string): Map<string, PendingAction> {
  let map = sessionPendingActions().get(sessionId)
  if (!map) {
    map = new Map()
    sessionPendingActions().set(sessionId, map)
  }
  return map
}

function trackPendingAction(
  sessionId: string,
  turnId: string,
  callId: string,
  toolName: string,
  startedAt = Date.now(),
): void {
  touchSession(sessionId)
  getSessionPendingActions(sessionId).set(callId, { toolName, startedAt, turnId })
}

function resolveToolDurationMs(
  state: TurnState,
  callId: string | undefined,
): number {
  const pending = callId ? getSessionPendingActions(state.sessionId).get(callId) : undefined
  if (pending) {
    if (pending.turnId !== state.turnId && state.accumulator.stepStartedAt !== undefined) {
      return Math.max(0, Date.now() - state.accumulator.stepStartedAt)
    }
    return Math.max(0, Date.now() - pending.startedAt)
  }
  if (state.accumulator.stepStartedAt !== undefined) {
    return Math.max(0, Date.now() - state.accumulator.stepStartedAt)
  }
  return 0
}

function consumeSessionApproval(
  sessionId: string,
  toolName: string,
  callId?: string,
): EveApprovalPending | undefined {
  const list = sessionApprovals().get(sessionId)
  if (!list?.length) return undefined
  const index = list.findIndex(approval =>
    (callId ? approval.callId === callId : false) || approval.toolName === toolName,
  )
  if (index === -1) return undefined
  const [approval] = list.splice(index, 1)
  if (list.length === 0) sessionApprovals().delete(sessionId)
  return approval
}

function storeSessionApprovals(sessionId: string, pending: EveApprovalPending[]): void {
  touchSession(sessionId)
  const existing = sessionApprovals().get(sessionId) ?? []
  sessionApprovals().set(sessionId, [...existing, ...pending])
}

function isEveInitialized(): boolean {
  return getEveGlobalState().initialized
}

function setEveInitialized(value: boolean): void {
  getEveGlobalState().initialized = value
}

function applySessionContext(sessionId: string, logger: AuditableLogger): void {
  touchSession(sessionId)
  const snapshot = sessionSnapshots().get(sessionId)
  if (snapshot && Object.keys(snapshot).length > 0) {
    logger.set({ ...snapshot })
  }
}

function persistSessionContext(sessionId: string, logger: AuditableLogger): void {
  const ctx = logger.getContext() as Record<string, unknown>
  const snapshot = { ...(sessionSnapshots().get(sessionId) ?? {}) }
  for (const [key, value] of Object.entries(ctx)) {
    if (!TURN_ONLY_KEYS.has(key) && value !== undefined) {
      snapshot[key] = value
    }
  }
  sessionSnapshots().set(sessionId, snapshot)
}

function flushEveMetadata(state: TurnState): void {
  if (state.accumulator.subagents.length === 0) return
  state.logger.set({
    eve: {
      subagents: state.accumulator.subagents.map(s => ({ ...s })),
    },
  })
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

  touchSession(sessionId)

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
    accumulator: freshAccumulator(options),
    sessionId,
    turnId,
  }

  applySessionContext(sessionId, logger)

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
      ...(ctx.channel.continuationToken ? { continuing: true } : {}),
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
    flushEveMetadata(state)
    flushAi(state)
    const httpStatus = opts.status ?? (opts.error ? 500 : 200)
    const ctx = state.logger.getContext() as Record<string, unknown>
    const phase = derivePhase(ctx, state.accumulator, httpStatus)
    const sessionTurns = bumpSessionTurnCount(sessionId)
    state.logger.set({
      eve: {
        ...(phase ? { phase } : {}),
        sessionTurns,
      },
    })
    persistSessionContext(sessionId, state.logger)
    await state.finish(opts)
  } finally {
    unbindTurnLogger(state.logger)
    turnStates().delete(key)
    if (activeTurnBySession().get(sessionId) === turnId) {
      activeTurnBySession().delete(sessionId)
    }
    pruneEmptySessionMaps(sessionId)
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

function getTurnState(sessionId: string, turnId: string): TurnState | undefined {
  return turnStates().get(turnKey(sessionId, turnId))
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
          const state = getOrCreateTurnState(ctx.session.id, event.data.turnId, options, ctx)
          state?.logger.set({
            eve: { turnSequence: event.data.sequence },
          })
          if (state) bindTurnLogger(state.logger)
        } catch (err) {
          console.error('[evlog] eve hook handler failed:', err)
        }
      },

      'message.received'(event, ctx) {
        runSafe(() => {
          if (redactMessage) return
          const state = getTurnState(ctx.session.id, event.data.turnId)
          if (!state) return
          state.logger.set({
            message: { received: truncateMessage(event.data.message) },
          })
        })
      },

      'step.started'(event, ctx) {
        runSafe(() => {
          const state = getTurnState(ctx.session.id, event.data.turnId)
          if (!state) return
          state.accumulator.stepStartedAt = Date.now()
        })
      },

      'step.completed'(event, ctx) {
        runSafe(() => {
          const state = getTurnState(ctx.session.id, event.data.turnId)
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

      'actions.requested'(event, ctx) {
        runSafe(() => {
          const state = getTurnState(ctx.session.id, event.data.turnId)
          if (!state) return
          bindTurnLogger(state.logger)
          const startedAt = Date.now()
          for (const action of event.data.actions) {
            if (action.kind === 'tool-call') {
              trackPendingAction(
                ctx.session.id,
                event.data.turnId,
                action.callId,
                action.toolName,
                startedAt,
              )
            }
          }
        })
      },

      'input.requested'(event, ctx) {
        runSafe(() => {
          const state = getTurnState(ctx.session.id, event.data.turnId)
          if (!state) return
          state.accumulator.pausedForInput = true
          const pending = event.data.requests.map(req => ({
            toolName: req.action.toolName,
            callId: req.action.callId,
          }))
          storeSessionApprovals(ctx.session.id, pending)
          const [first] = pending
          if (first) {
            state.logger.set({
              approval: { status: 'pending', tool: first.toolName },
            })
          }
        })
      },

      'action.result'(event, ctx) {
        runSafe(() => {
          const state = getTurnState(ctx.session.id, event.data.turnId)
          if (!state) return
          const callId = extractCallId(event.data.result)
          const sessionPending = getSessionPendingActions(state.sessionId)
          const turnPending = callId ? sessionPending.get(callId) : undefined

          const { status } = event.data
          const rejected = status === 'rejected'
          const success = status === 'completed'
          const toolName = turnPending?.toolName ?? extractToolName(event.data.result)
          const durationMs = resolveToolDurationMs(state, callId)

          if (callId) sessionPending.delete(callId)

          const execution: AIToolExecution = {
            name: toolName,
            durationMs,
            success,
          }
          if (rejected) {
            execution.error = 'rejected'
            state.accumulator.pausedForInput = false
            consumeSessionApproval(state.sessionId, toolName, callId)
            state.logger.set({
              approval: { status: 'rejected', tool: toolName },
            })
          } else if (success) {
            const approval = consumeSessionApproval(state.sessionId, toolName, callId)
            if (approval) {
              state.accumulator.pausedForInput = false
              state.logger.set({
                approval: { status: 'approved', tool: approval.toolName },
              })
            }
          } else if (event.data.error) {
            execution.error = event.data.error.message
          }
          state.accumulator.toolExecutions.push(execution)
        })
      },

      'subagent.called'(event, ctx) {
        runSafe(() => {
          const state = getTurnState(ctx.session.id, event.data.turnId)
          if (!state) return
          state.accumulator.subagents.push({
            callId: event.data.callId,
            name: event.data.name,
            toolName: event.data.toolName,
            childSessionId: event.data.childSessionId,
            status: 'called',
          })
        })
      },

      'subagent.completed'(event, ctx) {
        runSafe(() => {
          const sessionId = ctx.session.id
          const turnId = activeTurnBySession().get(sessionId)
          if (!turnId) return
          const state = getTurnState(sessionId, turnId)
          if (!state) return
          const existing = state.accumulator.subagents.find(s => s.callId === event.data.callId)
          if (existing) {
            existing.status = 'completed'
            existing.output = event.data.output
          } else {
            state.accumulator.subagents.push({
              callId: event.data.callId,
              name: event.data.subagentName,
              status: 'completed',
              output: event.data.output,
            })
          }
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
          const state = getTurnState(ctx.session.id, event.data.turnId)
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

/** @internal Simulates eve tool execution where AsyncLocalStorage did not propagate. */
export function detachActiveTurnLoggerForTests(): void {
  const logger = turnLoggerStorage.getStore()
  if (logger) unbindTurnLogger(logger)
}

/** @internal Resets module state between unit tests. */
export function resetEvlogEveForTests(): void {
  clearAsyncLocalStorage(turnLoggerStorage)
  turnStates().clear()
  activeTurnBySession().clear()
  sessionSnapshots().clear()
  sessionPendingActions().clear()
  sessionApprovals().clear()
  sessionRollups().clear()
  setEveInitialized(false)
  delete (globalThis as typeof globalThis & { [EVE_GLOBAL_STATE]?: EveGlobalState })[EVE_GLOBAL_STATE]
}

export type { ModelCost } from '../ai/index'
