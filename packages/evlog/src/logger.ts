import type { DrainContext, EnvironmentContext, FieldContext, Log, LogLevel, LoggerConfig, RequestLogger, RequestLoggerOptions, SamplingConfig, TailSamplingContext, WideEvent } from './types'
import { colors, cssColors, detectEnvironment, escapeFormatString, formatDuration, getConsoleMethod, getCssLevelColor, getLevelColor, isClient, isDev, matchesPattern } from './utils'

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

function deepDefaults(base: Record<string, unknown>, defaults: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base }
  for (const key in defaults) {
    const baseVal = result[key]
    const defaultVal = defaults[key]
    if (baseVal === undefined || baseVal === null) {
      result[key] = defaultVal
    } else if (isPlainObject(baseVal) && isPlainObject(defaultVal)) {
      result[key] = deepDefaults(baseVal, defaultVal)
    }
  }
  return result
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

function emitWideEvent(level: LogLevel, event: Record<string, unknown>, skipSamplingCheck = false, deferDrain = false): WideEvent | null {
  if (!globalEnabled) return null

  if (!skipSamplingCheck && !shouldSample(level)) {
    return null
  }

  const formatted: WideEvent = {
    timestamp: new Date().toISOString(),
    level,
    ...globalEnv,
    ...event,
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
      const timestamp = new Date().toISOString().slice(11, 23)
      console.log(
        `%c${timestamp}%c %c[${escapeFormatString(tag)}]%c ${escapeFormatString(message)}`,
        cssColors.dim,
        cssColors.reset,
        levelColor,
        cssColors.reset,
      )
    } else {
      const color = getLevelColor(level)
      const timestamp = new Date().toISOString().slice(11, 23)
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
  if (isClient()) {
    prettyPrintWideEventBrowser(event)
    return
  }

  const { timestamp, level, service, environment, version, ...rest } = event
  const levelColor = getLevelColor(level as string)
  const ts = (timestamp as string).slice(11, 23)

  let header = `${colors.dim}${ts}${colors.reset} ${levelColor}${(level as string).toUpperCase()}${colors.reset}`
  header += ` ${colors.cyan}[${service}]${colors.reset}`

  if (rest.method && rest.path) {
    header += ` ${rest.method} ${rest.path}`
    delete rest.method
    delete rest.path
  }

  if (rest.status) {
    const statusColor = (rest.status as number) >= 400 ? colors.red : colors.green
    header += ` ${statusColor}${rest.status}${colors.reset}`
    delete rest.status
  }

  if (rest.duration) {
    header += ` ${colors.dim}in ${rest.duration}${colors.reset}`
    delete rest.duration
  }

  console.log(header)

  const entries = Object.entries(rest).filter(([_, v]) => v !== undefined)
  const lastIndex = entries.length - 1

  entries.forEach(([key, value], index) => {
    const isLast = index === lastIndex
    const prefix = isLast ? '└─' : '├─'
    const formatted = formatValue(value)
    console.log(`  ${colors.dim}${prefix}${colors.reset} ${colors.cyan}${key}:${colors.reset} ${formatted}`)
  })
}

function prettyPrintWideEventBrowser(event: Record<string, unknown>): void {
  const { timestamp, level, service, environment, version, ...rest } = event
  const levelColor = getCssLevelColor(level as string)
  const ts = (timestamp as string).slice(11, 23)

  const parts: string[] = []
  const styles: string[] = []

  parts.push(`%c${ts}%c %c${(level as string).toUpperCase()}%c %c[${escapeFormatString(String(service))}]%c`)
  styles.push(cssColors.dim, cssColors.reset, levelColor, cssColors.reset, cssColors.cyan, cssColors.reset)

  if (rest.method && rest.path) {
    parts.push(` ${escapeFormatString(String(rest.method))} ${escapeFormatString(String(rest.path))}`)
    delete rest.method
    delete rest.path
  }

  if (rest.status) {
    const statusColor = (rest.status as number) >= 400 ? cssColors.red : cssColors.green
    parts.push(` %c${rest.status}%c`)
    styles.push(statusColor, cssColors.reset)
    delete rest.status
  }

  if (rest.duration) {
    parts.push(` %c${escapeFormatString(`in ${rest.duration}`)}%c`)
    styles.push(cssColors.dim, cssColors.reset)
    delete rest.duration
  }

  console.log(parts.join(''), ...styles)

  const entries = Object.entries(rest).filter(([_, v]) => v !== undefined)
  const lastIndex = entries.length - 1

  entries.forEach(([key, value], index) => {
    const isLast = index === lastIndex
    const prefix = isLast ? '└─' : '├─'
    const formatted = escapeFormatString(formatValue(value))
    console.log(
      `  %c${prefix}%c %c${escapeFormatString(key)}:%c ${formatted}`,
      cssColors.dim,
      cssColors.reset,
      cssColors.cyan,
      cssColors.reset,
    )
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
  let context: Record<string, unknown> = { ...initialContext }
  let hasError = false
  let hasWarn = false

  function addLog(level: 'info' | 'warn', message: string): void {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
    }

    const requestLogs = Array.isArray(context.requestLogs)
      ? [...context.requestLogs, entry]
      : [entry]

    context = {
      ...context,
      requestLogs,
    }
  }

  return {
    set(data: FieldContext<T>): void {
      context = deepDefaults(data as Record<string, unknown>, context) as Record<string, unknown>
    },

    error(error: Error | string, errorContext?: FieldContext<T>): void {
      hasError = true
      const err = typeof error === 'string' ? new Error(error) : error

      const errorData = {
        ...(errorContext as Record<string, unknown>),
        error: {
          name: err.name,
          message: err.message,
          stack: err.stack,
          ...('status' in err && { status: (err as Record<string, unknown>).status }),
          ...('statusText' in err && { statusText: (err as Record<string, unknown>).statusText }),
          ...('statusCode' in err && { statusCode: (err as Record<string, unknown>).statusCode }),
          ...('statusMessage' in err && { statusMessage: (err as Record<string, unknown>).statusMessage }),
          ...('data' in err && { data: (err as Record<string, unknown>).data }),
          ...('cause' in err && { cause: (err as unknown as Record<string, unknown>).cause }),
        },
      }
      context = deepDefaults(errorData, context) as Record<string, unknown>
    },

    info(message: string, infoContext?: FieldContext<T>): void {
      addLog('info', message)
      if (infoContext) {
        const { requestLogs: _, ...rest } = infoContext as Record<string, unknown>
        context = deepDefaults(rest, context) as Record<string, unknown>
      }
    },

    warn(message: string, warnContext?: FieldContext<T>): void {
      hasWarn = true
      addLog('warn', message)
      if (warnContext) {
        const { requestLogs: _, ...rest } = warnContext as Record<string, unknown>
        context = deepDefaults(rest, context) as Record<string, unknown>
      }
    },

    emit(overrides?: FieldContext<T> & { _forceKeep?: boolean }): WideEvent | null {
      const durationMs = Date.now() - startTime
      const duration = formatDuration(durationMs)
      const level: LogLevel = hasError ? 'error' : hasWarn ? 'warn' : 'info'

      // Extract _forceKeep from overrides (set by evlog:emit:keep hook)
      const { _forceKeep, ...restOverrides } = (overrides ?? {}) as Record<string, unknown> & { _forceKeep?: boolean }

      // Build tail sampling context
      const tailCtx: TailSamplingContext = {
        status: (context.status ?? restOverrides.status) as number | undefined,
        duration: durationMs,
        path: context.path as string | undefined,
        method: context.method as string | undefined,
        context: { ...context, ...restOverrides },
      }

      // Tail sampling: force keep if hook or built-in conditions match
      const forceKeep = _forceKeep || shouldKeep(tailCtx)

      // Apply head sampling only if not force-kept
      if (!forceKeep && !shouldSample(level)) {
        return null
      }

      return emitWideEvent(level, {
        ...context,
        ...restOverrides,
        duration,
      }, true, deferDrain)
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
