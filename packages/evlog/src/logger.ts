import { isDevelopment } from 'std-env'
import type { EnvironmentContext, Log, LogLevel, LoggerConfig, RequestLogger, RequestLoggerOptions, SamplingConfig, TailSamplingContext, WideEvent } from './types'
import { colors, detectEnvironment, formatDuration, getConsoleMethod, getLevelColor, matchesPattern } from './utils'

let globalEnv: EnvironmentContext = {
  service: 'app',
  environment: 'development',
}

let globalPretty = isDevelopment
let globalSampling: SamplingConfig = {}

/**
 * Initialize the logger with configuration.
 * Call this once at application startup.
 */
export function initLogger(config: LoggerConfig = {}): void {
  const detected = detectEnvironment()

  globalEnv = {
    service: config.env?.service ?? detected.service ?? 'app',
    environment: config.env?.environment ?? detected.environment ?? 'development',
    version: config.env?.version ?? detected.version,
    commitHash: config.env?.commitHash ?? detected.commitHash,
    region: config.env?.region ?? detected.region,
  }

  globalPretty = config.pretty ?? isDevelopment
  globalSampling = config.sampling ?? {}
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

function emitWideEvent(level: LogLevel, event: Record<string, unknown>, skipSamplingCheck = false): WideEvent | null {
  if (!skipSamplingCheck && !shouldSample(level)) {
    return null
  }

  const formatted: WideEvent = {
    timestamp: new Date().toISOString(),
    level,
    ...globalEnv,
    ...event,
  }

  if (globalPretty) {
    prettyPrintWideEvent(formatted)
  } else {
    console[getConsoleMethod(level)](JSON.stringify(formatted))
  }

  return formatted
}

function emitTaggedLog(level: LogLevel, tag: string, message: string): void {
  if (globalPretty) {
    if (!shouldSample(level)) {
      return
    }
    const color = getLevelColor(level)
    const timestamp = new Date().toISOString().slice(11, 23)
    console.log(`${colors.dim}${timestamp}${colors.reset} ${color}[${tag}]${colors.reset} ${message}`)
  } else {
    emitWideEvent(level, { tag, message })
  }
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
export const log: Log = {
  info: createLogMethod('info'),
  error: createLogMethod('error'),
  warn: createLogMethod('warn'),
  debug: createLogMethod('debug'),
}

/**
 * Create a request-scoped logger for building wide events.
 *
 * @example
 * ```ts
 * const log = createRequestLogger({ method: 'POST', path: '/checkout' })
 * log.set({ user: { id: '123' } })
 * log.set({ cart: { items: 3 } })
 * log.emit()
 * ```
 */
export function createRequestLogger(options: RequestLoggerOptions = {}): RequestLogger {
  const startTime = Date.now()
  let context: Record<string, unknown> = {
    method: options.method,
    path: options.path,
    requestId: options.requestId,
  }
  let hasError = false

  return {
    set<T extends Record<string, unknown>>(data: T): void {
      context = { ...context, ...data }
    },

    error(error: Error | string, errorContext?: Record<string, unknown>): void {
      hasError = true
      const err = typeof error === 'string' ? new Error(error) : error

      context = {
        ...context,
        ...errorContext,
        error: {
          name: err.name,
          message: err.message,
          stack: err.stack,
        },
      }
    },

    emit(overrides?: Record<string, unknown> & { _forceKeep?: boolean }): WideEvent | null {
      const durationMs = Date.now() - startTime
      const duration = formatDuration(durationMs)
      const level: LogLevel = hasError ? 'error' : 'info'

      // Extract _forceKeep from overrides (set by evlog:emit:keep hook)
      const { _forceKeep, ...restOverrides } = overrides ?? {}

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
      }, true)
    },

    getContext(): Record<string, unknown> {
      return { ...context }
    },
  }
}

/**
 * Get the current environment context.
 */
export function getEnvironment(): EnvironmentContext {
  return { ...globalEnv }
}
