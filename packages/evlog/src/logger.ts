import type { DrainContext, EnvironmentContext, FieldContext, Log, LogLevel, LoggerConfig, RequestLogger, RequestLoggerOptions, SamplingConfig, TailSamplingContext, WideEvent } from './types'
import { colors, cssColors, detectEnvironment, escapeFormatString, formatDuration, getConsoleMethod, getCssLevelColor, getLevelColor, isClient, isDev, matchesPattern } from './utils'

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
let globalEnabled = true
let globalSilent = false

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
  globalSilent = config.silent ?? false

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

  if (!ownsEvent && !shouldSample(level)) {
    return null
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
    // Flatten object to key=value pairs
    const pairs: string[] = []
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined && v !== null) {
        if (typeof v === 'object') {
          // For nested objects, show as JSON
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

  const entries = Object.entries(rest).filter(([_, v]) => v !== undefined)
  const lastIndex = entries.length - 1

  entries.forEach(([key, value], index) => {
    const prefix = index === lastIndex ? '└─' : '├─'
    const val = formatValue(value)
    if (browser) {
      console.log(`  %c${prefix}%c %c${escapeFormatString(key)}:%c ${escapeFormatString(val)}`, cssColors.dim, cssColors.reset, cssColors.cyan, cssColors.reset)
    } else {
      console.log(`  ${colors.dim}${prefix}${colors.reset} ${colors.cyan}${key}:${colors.reset} ${val}`)
    }
  })
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
      for (const k of ['status', 'statusText', 'statusCode', 'statusMessage', 'data', 'cause'] as const) {
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
      return { ...context }
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

// @ts-expect-error __EVLOG_CONFIG__ is a compile-time constant injected by evlog/vite
if (typeof __EVLOG_CONFIG__ !== 'undefined') initLogger(__EVLOG_CONFIG__)
