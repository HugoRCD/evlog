import type { DrainContext, EnvironmentContext, FieldContext, Log, LogLevel, LoggerConfig, RedactConfig, RequestLogger, RequestLoggerOptions, SamplingConfig, TailSamplingContext, WideEvent } from './types'
import { redactEvent, resolveRedactConfig } from './redact'
import { colors, cssColors, detectEnvironment, escapeFormatString, formatDuration, getConsoleMethod, getCssLevelColor, getLevelColor, isClient, isDev, isLevelEnabled, matchesPattern } from './utils'

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

const _tsDate = new Date()
function isoNow(): string {
  _tsDate.setTime(Date.now())
  return _tsDate.toISOString()
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key in source) {
    const sourceVal = source[key]
    if (sourceVal === undefined || sourceVal === null) continue
    const targetVal = target[key]
    if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
      mergeInto(targetVal, sourceVal)
    } else if (Array.isArray(targetVal) && Array.isArray(sourceVal)) {
      target[key] = [...targetVal, ...sourceVal]
    } else {
      target[key] = sourceVal
    }
  }
}

let globalEnv: EnvironmentContext = {
  service: 'app',
  environment: 'development',
}

let globalPretty = isDev()
let globalSampling: SamplingConfig = {}
let globalStringify = true
let globalDrain: ((ctx: DrainContext) => void | Promise<void>) | undefined
let globalRedact: RedactConfig | undefined
let globalEnabled = true
let globalSilent = false
/** Minimum level for the global `log` API only (`ownsEvent === false`). Default: all levels. */
let globalMinLevel: LogLevel = 'debug'
let _locked = false

/**
 * Initialize the logger with configuration.
 * Call this once at application startup.
 */
export function initLogger(config: LoggerConfig = {}): void {
  globalEnabled = config.enabled ?? true
  const detected = detectEnvironment()

  globalEnv = {
    service: config.env?.service ?? detected.service ?? 'app',
    environment: config.env?.environment ?? detected.environment ?? 'development',
    version: config.env?.version ?? detected.version,
    commitHash: config.env?.commitHash ?? detected.commitHash,
    region: config.env?.region ?? detected.region,
  }

  globalPretty = config.pretty ?? isDev()
  globalSampling = config.sampling ?? {}
  globalStringify = config.stringify ?? true
  globalDrain = config.drain
  globalRedact = resolveRedactConfig(config.redact ?? !isDev())
  globalSilent = config.silent ?? false
  globalMinLevel = config.minLevel ?? 'debug'

  if (globalSilent && !globalDrain && !config._suppressDrainWarning) {
    console.warn('[evlog] silent mode is enabled but no drain is configured. Events will be built and sampled but not output anywhere. Set a drain via initLogger({ drain }) or a framework hook (evlog:drain).')
  }
}

/**
 * Check if logging is globally enabled.
 */
export function isEnabled(): boolean {
  return globalEnabled
}

/**
 * @internal Lock the logger to prevent re-initialization.
 * Called by instrumentation register() after setting up the logger with drain.
 * Prevents configureHandler() from overwriting the drain config.
 */
export function lockLogger(): void {
  _locked = true
}

/**
 * @internal Check if the logger has been locked by instrumentation.
 */
export function isLoggerLocked(): boolean {
  return _locked
}

/**
 * @internal Get the globally configured drain callback.
 * Used by framework middleware to fall back to the global drain
 * when no middleware-level drain is provided.
 */
export function getGlobalDrain(): ((ctx: DrainContext) => void | Promise<void>) | undefined {
  return globalDrain
}

/**
 * Determine if a log at the given level should be emitted based on sampling config.
 * Error level defaults to 100% (always logged) unless explicitly configured otherwise.
 */
function shouldSample(level: LogLevel): boolean {
  const { rates } = globalSampling
  if (!rates) {
    return true // No sampling configured, log everything
  }

  // Error defaults to 100% unless explicitly set
  const percentage = level === 'error' && rates.error === undefined
    ? 100
    : rates[level] ?? 100

  // 0% = never log, 100% = always log
  if (percentage <= 0) return false
  if (percentage >= 100) return true

  return Math.random() * 100 < percentage
}

/**
 * Evaluate tail sampling conditions to determine if a log should be force-kept.
 * Returns true if ANY condition matches (OR logic).
 */
export function shouldKeep(ctx: TailSamplingContext): boolean {
  const { keep } = globalSampling
  if (!keep?.length) return false

  return keep.some((condition) => {
    if (condition.status !== undefined && ctx.status !== undefined && ctx.status >= condition.status) {
      return true
    }
    if (condition.duration !== undefined && ctx.duration !== undefined && ctx.duration >= condition.duration) {
      return true
    }
    if (condition.path && ctx.path && matchesPattern(ctx.path, condition.path)) {
      return true
    }
    return false
  })
}

function emitWideEvent(level: LogLevel, event: Record<string, unknown>, deferDrain = false, ownsEvent = false): WideEvent | null {
  if (!globalEnabled) return null

  if (!ownsEvent) {
    if (!isLevelEnabled(level, globalMinLevel)) {
      return null
    }
    if (!shouldSample(level)) {
      return null
    }
  }

  let formatted: WideEvent
  if (ownsEvent) {
    event.timestamp = isoNow()
    event.level = level
    if (event.service === undefined) event.service = globalEnv.service
    if (event.environment === undefined) event.environment = globalEnv.environment
    if (globalEnv.version !== undefined && event.version === undefined) event.version = globalEnv.version
    if (globalEnv.commitHash !== undefined && event.commitHash === undefined) event.commitHash = globalEnv.commitHash
    if (globalEnv.region !== undefined && event.region === undefined) event.region = globalEnv.region
    formatted = event as WideEvent
  } else {
    formatted = {
      timestamp: isoNow(),
      level,
      ...globalEnv,
      ...event,
    }
  }

  if (globalRedact) {
    redactEvent(formatted, globalRedact)
  }

  if (!globalSilent) {
    if (globalPretty) {
      prettyPrintWideEvent(formatted)
    } else if (globalStringify) {
      console[getConsoleMethod(level)](JSON.stringify(formatted))
    } else {
      console[getConsoleMethod(level)](formatted)
    }
  }

  if (globalDrain && !deferDrain) {
    Promise.resolve(globalDrain({ event: formatted })).catch((err) => {
      console.error('[evlog] drain failed:', err)
    })
  }

  return formatted
}

function emitTaggedLog(level: LogLevel, tag: string, message: string): void {
  if (!globalEnabled) return

  if (globalPretty && !globalSilent) {
    if (!isLevelEnabled(level, globalMinLevel)) {
      return
    }
    if (!shouldSample(level)) {
      return
    }

    if (isClient()) {
      const levelColor = getCssLevelColor(level)
      const timestamp = isoNow().slice(11, 23)
      console.log(
        `%c${timestamp}%c %c[${escapeFormatString(tag)}]%c ${escapeFormatString(message)}`,
        cssColors.dim,
        cssColors.reset,
        levelColor,
        cssColors.reset,
      )
    } else {
      const color = getLevelColor(level)
      const timestamp = isoNow().slice(11, 23)
      console.log(`${colors.dim}${timestamp}${colors.reset} ${color}[${tag}]${colors.reset} ${message}`)
    }

    return
  }
  emitWideEvent(level, { tag, message })
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value)
  }
  if (typeof value === 'object') {
    const pairs: string[] = []
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined && v !== null) {
        if (typeof v === 'object') {
          pairs.push(`${k}=${JSON.stringify(v)}`)
        } else {
          pairs.push(`${k}=${v}`)
        }
      }
    }
    return pairs.join(' ')
  }
  return String(value)
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(6)}`
  if (cost < 1) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

interface TreeEntry {
  key: string
  value: string
  children?: string[]
}

function buildAIEntries(ai: Record<string, unknown>): TreeEntry[] {
  const entries: TreeEntry[] = []

  // Header
  const headerParts: string[] = []
  if (ai.model) {
    let m = String(ai.model)
    if (ai.provider) m += ` (${ai.provider})`
    headerParts.push(m)
  }
  if (ai.calls) headerParts.push(`${ai.calls} call${(ai.calls as number) > 1 ? 's' : ''}`)
  if (ai.steps && (ai.steps as number) > 1) headerParts.push(`${ai.steps} steps`)
  entries.push({ key: 'ai', value: headerParts.join(' · ') })

  // Tokens
  const inputTokens = ai.inputTokens as number | undefined
  const outputTokens = ai.outputTokens as number | undefined
  const totalTokens = ai.totalTokens as number | undefined
  if (inputTokens !== undefined && outputTokens !== undefined) {
    let tokLine = `${inputTokens} in → ${outputTokens} out`
    if (totalTokens) tokLine += ` (${totalTokens} total)`
    const extras: string[] = []
    if (ai.cacheReadTokens) extras.push(`${ai.cacheReadTokens} cache read`)
    if (ai.cacheWriteTokens) extras.push(`${ai.cacheWriteTokens} cache write`)
    if (ai.reasoningTokens) extras.push(`${ai.reasoningTokens} reasoning`)
    if (extras.length) tokLine += ` · ${extras.join(' · ')}`
    entries.push({ key: 'ai.tokens', value: tokLine })
  }

  // Streaming
  const msFirst = ai.msToFirstChunk as number | undefined
  const msFinish = ai.msToFinish as number | undefined
  const tps = ai.tokensPerSecond as number | undefined
  if (msFirst !== undefined || msFinish !== undefined) {
    const parts: string[] = []
    if (msFirst !== undefined) parts.push(`${formatDuration(msFirst)} to first chunk`)
    if (msFinish !== undefined) parts.push(`${formatDuration(msFinish)} total`)
    let streamLine = parts.join(' → ')
    if (tps) streamLine += ` · ${tps} tok/s`
    entries.push({ key: 'ai.streaming', value: streamLine })
  }

  // Cost
  if (ai.estimatedCost !== undefined) {
    entries.push({ key: 'ai.cost', value: formatCost(ai.estimatedCost as number) })
  }

  // Total duration
  if (ai.totalDurationMs !== undefined) {
    entries.push({ key: 'ai.totalDuration', value: formatDuration(ai.totalDurationMs as number) })
  }

  // Tools — merged from toolCalls (middleware) + tools (telemetry)
  const toolCalls = ai.toolCalls as unknown[] | undefined
  const tools = ai.tools as Array<{ name: string, durationMs: number, success: boolean, error?: string }> | undefined
  const hasInputs = toolCalls?.length ? typeof toolCalls[0] === 'object' : false

  if (tools?.length) {
    const children = tools.map((t, idx) => {
      const mark = t.success ? '✓' : '✗'
      let line = `${t.name} ${formatDuration(t.durationMs)} ${mark}`
      if (t.error) line += ` ${t.error}`
      if (hasInputs && toolCalls && idx < toolCalls.length) {
        const tc = toolCalls[idx] as { input: unknown }
        const inputStr = typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input)
        const truncated = inputStr.length > 100 ? `${inputStr.slice(0, 100)}…` : inputStr
        line += ` ${truncated}`
      }
      return line
    })
    entries.push({ key: 'ai.tools', value: '', children })
  } else if (toolCalls?.length) {
    if (hasInputs) {
      const children = (toolCalls as Array<{ name: string, input: unknown }>).map((tc) => {
        const inputStr = typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input)
        const truncated = inputStr.length > 100 ? `${inputStr.slice(0, 100)}…` : inputStr
        return `${tc.name}(${truncated})`
      })
      entries.push({ key: 'ai.tools', value: '', children })
    } else {
      entries.push({ key: 'ai.tools', value: (toolCalls as string[]).join(', ') })
    }
  }

  // Steps
  const stepsUsage = ai.stepsUsage as Array<Record<string, unknown>> | undefined
  if (stepsUsage?.length) {
    const allSameModel = stepsUsage.every(s => s.model === stepsUsage[0]!.model)
    const children = stepsUsage.map((s) => {
      const prefix = allSameModel ? '' : `${s.model} `
      let line = `${prefix}${s.inputTokens} in → ${s.outputTokens} out`
      const stepTools = s.toolCalls as string[] | undefined
      if (stepTools?.length) line += ` [${stepTools.join(', ')}]`
      return line
    })
    entries.push({ key: 'ai.steps', value: '', children })
  } else if (ai.steps && (ai.steps as number) > 1) {
    entries.push({ key: 'ai.steps', value: String(ai.steps) })
  }

  // Embedding
  const embedding = ai.embedding as Record<string, unknown> | undefined
  if (embedding) {
    const parts: string[] = []
    if (embedding.model) parts.push(String(embedding.model))
    parts.push(`${embedding.tokens} tokens`)
    if (embedding.dimensions) parts.push(`${embedding.dimensions}d`)
    if (embedding.count) parts.push(`${embedding.count} items`)
    entries.push({ key: 'ai.embedding', value: parts.join(' · ') })
  }

  if (ai.finishReason) entries.push({ key: 'ai.finishReason', value: String(ai.finishReason) })
  if (ai.error) entries.push({ key: 'ai.error', value: String(ai.error) })
  if (ai.responseId) entries.push({ key: 'ai.responseId', value: String(ai.responseId) })

  return entries
}

function prettyPrintWideEvent(event: Record<string, unknown>): void {
  const { timestamp, level, service, environment, version, ...rest } = event
  const ts = (timestamp as string).slice(11, 23)
  const browser = isClient()

  const parts: string[] = []
  const styles: string[] = []

  if (browser) {
    const lc = getCssLevelColor(level as string)
    parts.push(`%c${ts}%c %c${(level as string).toUpperCase()}%c %c[${escapeFormatString(String(service))}]%c`)
    styles.push(cssColors.dim, cssColors.reset, lc, cssColors.reset, cssColors.cyan, cssColors.reset)
  } else {
    const lc = getLevelColor(level as string)
    parts.push(`${colors.dim}${ts}${colors.reset} ${lc}${(level as string).toUpperCase()}${colors.reset} ${colors.cyan}[${service}]${colors.reset}`)
  }

  if (rest.method && rest.path) {
    parts.push(browser ? ` ${escapeFormatString(String(rest.method))} ${escapeFormatString(String(rest.path))}` : ` ${rest.method} ${rest.path}`)
    delete rest.method
    delete rest.path
  }

  if (rest.status) {
    const sc = browser
      ? ((rest.status as number) >= 400 ? cssColors.red : cssColors.green)
      : ((rest.status as number) >= 400 ? colors.red : colors.green)
    if (browser) {
      parts.push(` %c${rest.status}%c`)
      styles.push(sc, cssColors.reset)
    } else {
      parts.push(` ${sc}${rest.status}${colors.reset}`)
    }
    delete rest.status
  }

  if (rest.duration) {
    if (browser) {
      parts.push(` %c${escapeFormatString(`in ${rest.duration}`)}%c`)
      styles.push(cssColors.dim, cssColors.reset)
    } else {
      parts.push(` ${colors.dim}in ${rest.duration}${colors.reset}`)
    }
    delete rest.duration
  }

  console.log(parts.join(''), ...styles)

  const aiData = rest.ai as Record<string, unknown> | undefined
  if (aiData && typeof aiData === 'object') {
    delete rest.ai
  }

  const restEntries = Object.entries(rest).filter(([_, v]) => v !== undefined)
  const aiEntries = aiData ? buildAIEntries(aiData) : []
  const allEntries: TreeEntry[] = [
    ...restEntries.map(([key, value]) => ({ key, value: formatValue(value) })),
    ...aiEntries,
  ]

  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i]!
    const hasChildren = entry.children && entry.children.length > 0
    const isLast = i === allEntries.length - 1 && !hasChildren
    const prefix = isLast ? '└─' : '├─'

    if (browser) {
      const val = entry.value ? ` ${escapeFormatString(entry.value)}` : ''
      console.log(`  %c${prefix}%c %c${escapeFormatString(entry.key)}:%c${val}`, cssColors.dim, cssColors.reset, cssColors.cyan, cssColors.reset)
    } else {
      const val = entry.value ? ` ${entry.value}` : ''
      console.log(`  ${colors.dim}${prefix}${colors.reset} ${colors.cyan}${entry.key}:${colors.reset}${val}`)
    }

    if (hasChildren) {
      const isLastEntry = i === allEntries.length - 1
      const connector = isLastEntry ? ' ' : '│'
      for (let j = 0; j < entry.children!.length; j++) {
        const child = entry.children![j]!
        const isLastChild = j === entry.children!.length - 1
        const childPrefix = isLastChild ? '└─' : '├─'
        if (browser) {
          console.log(`  %c${connector}  ${childPrefix}%c ${escapeFormatString(child)}`, cssColors.dim, cssColors.reset)
        } else {
          console.log(`  ${colors.dim}${connector}  ${childPrefix}${colors.reset} ${child}`)
        }
      }
    }
  }
}

function createLogMethod(level: LogLevel) {
  return function logMethod(tagOrEvent: string | Record<string, unknown>, message?: string): void {
    if (typeof tagOrEvent === 'string' && message !== undefined) {
      emitTaggedLog(level, tagOrEvent, message)
    } else if (typeof tagOrEvent === 'object') {
      emitWideEvent(level, tagOrEvent)
    } else {
      emitTaggedLog(level, 'log', String(tagOrEvent))
    }
  }
}

/**
 * Simple logging API - as easy as console.log
 *
 * @example
 * ```ts
 * log.info('auth', 'User logged in')
 * log.error({ action: 'payment', error: 'failed' })
 * ```
 */
const _log: Log = {
  info: createLogMethod('info'),
  error: createLogMethod('error'),
  warn: createLogMethod('warn'),
  debug: createLogMethod('debug'),
}

export { _log as log }

const noopLogger: RequestLogger = {
  set() {},
  error() {},
  info() {},
  warn() {},
  emit() {
    return null
  },
  getContext() {
    return {}
  },
}

/**
 * @internal Options for createLogger that are not part of the public API.
 */
interface CreateLoggerInternalOptions {
  /**
   * When true, the global drain is skipped on emit.
   * Used by framework middleware that runs its own enrich+drain pipeline.
   */
  _deferDrain?: boolean
}

/**
 * Create a scoped logger for building wide events.
 * Use this for any context: workflows, jobs, scripts, queues, etc.
 *
 * @example
 * ```ts
 * const log = createLogger({ jobId: job.id, queue: 'emails' })
 * log.set({ batch: { size: 50, processed: 12 } })
 * log.emit()
 * ```
 */
export function createLogger<T extends object = Record<string, unknown>>(initialContext: Record<string, unknown> = {}, internalOptions?: CreateLoggerInternalOptions): RequestLogger<T> {
  if (!globalEnabled) return noopLogger as RequestLogger<T>

  const deferDrain = internalOptions?._deferDrain ?? false
  const startTime = Date.now()
  const context: Record<string, unknown> = { ...initialContext }
  let hasError = false
  let hasWarn = false

  function addLog(level: 'info' | 'warn', message: string): void {
    if (!Array.isArray(context.requestLogs)) {
      context.requestLogs = []
    }
    (context.requestLogs as unknown[]).push({
      level,
      message,
      timestamp: isoNow(),
    })
  }

  return {
    set(data: FieldContext<T>): void {
      mergeInto(context, data as Record<string, unknown>)
    },

    error(error: Error | string, errorContext?: FieldContext<T>): void {
      hasError = true
      const err = typeof error === 'string' ? new Error(error) : error

      if (errorContext) {
        mergeInto(context, errorContext as Record<string, unknown>)
      }

      const errorObj: Record<string, unknown> = {
        name: err.name,
        message: err.message,
        stack: err.stack,
      }
      const errRecord = err as unknown as Record<string, unknown>
      for (const k of ['status', 'statusText', 'statusCode', 'statusMessage', 'data', 'cause', 'internal'] as const) {
        if (k in err) errorObj[k] = errRecord[k]
      }

      if (isPlainObject(context.error)) {
        mergeInto(context.error as Record<string, unknown>, errorObj)
      } else {
        context.error = errorObj
      }
    },

    info(message: string, infoContext?: FieldContext<T>): void {
      addLog('info', message)
      if (infoContext) {
        const { requestLogs: _, ...rest } = infoContext as Record<string, unknown>
        mergeInto(context, rest)
      }
    },

    warn(message: string, warnContext?: FieldContext<T>): void {
      hasWarn = true
      addLog('warn', message)
      if (warnContext) {
        const { requestLogs: _, ...rest } = warnContext as Record<string, unknown>
        mergeInto(context, rest)
      }
    },

    emit(overrides?: FieldContext<T> & { _forceKeep?: boolean }): WideEvent | null {
      const durationMs = Date.now() - startTime
      const level: LogLevel = hasError ? 'error' : hasWarn ? 'warn' : 'info'

      let forceKeep = false
      if (overrides?._forceKeep) {
        forceKeep = true
      } else if (globalSampling.keep?.length) {
        const status = (overrides as Record<string, unknown> | undefined)?.status ?? context.status
        forceKeep = shouldKeep({
          status: status as number | undefined,
          duration: durationMs,
          path: context.path as string | undefined,
          method: context.method as string | undefined,
          context,
        })
      }

      if (!forceKeep && !shouldSample(level)) {
        return null
      }

      if (overrides) {
        const obj = overrides as Record<string, unknown>
        for (const key in obj) {
          if (key !== '_forceKeep') context[key] = obj[key]
        }
      }
      context.duration = formatDuration(durationMs)

      return emitWideEvent(level, context, deferDrain, true)
    },

    getContext(): FieldContext<T> & Record<string, unknown> {
      return { ...context } as FieldContext<T> & Record<string, unknown>
    },
  }
}

/**
 * Create a request-scoped logger for building wide events.
 * Convenience wrapper around `createLogger` that pre-populates HTTP request fields.
 *
 * @example
 * ```ts
 * const log = createRequestLogger({ method: 'POST', path: '/checkout' })
 * log.set({ user: { id: '123' } })
 * log.set({ cart: { items: 3 } })
 * log.emit()
 * ```
 */
export function createRequestLogger<T extends object = Record<string, unknown>>(options: RequestLoggerOptions = {}, internalOptions?: CreateLoggerInternalOptions): RequestLogger<T> {
  const initial: Record<string, unknown> = {}
  if (options.method !== undefined) initial.method = options.method
  if (options.path !== undefined) initial.path = options.path
  if (options.requestId !== undefined) initial.requestId = options.requestId
  return createLogger<T>(initial, internalOptions)
}

/**
 * Get the current environment context.
 */
export function getEnvironment(): EnvironmentContext {
  return { ...globalEnv }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __EVLOG_CONFIG__: import('./types').LoggerConfig | undefined

if (typeof __EVLOG_CONFIG__ !== 'undefined') initLogger(__EVLOG_CONFIG__)
