import type { Log, LogLevel, SamplingConfig } from '../../types'
import { getConsoleMethod } from '../../utils'

const IS_CLIENT = typeof window !== 'undefined'

let clientPretty = true
let clientService = 'client'
let clientSampling: SamplingConfig = {}

const LEVEL_COLORS: Record<string, string> = {
  error: 'color: #ef4444; font-weight: bold',
  warn: 'color: #f59e0b; font-weight: bold',
  info: 'color: #06b6d4; font-weight: bold',
  debug: 'color: #6b7280; font-weight: bold',
}

export function initLog(options: { pretty?: boolean, service?: string, sampling?: SamplingConfig } = {}): void {
  clientPretty = options.pretty ?? true
  clientService = options.service ?? 'client'
  clientSampling = options.sampling ?? {}
}

/**
 * Determine if a log at the given level should be emitted based on sampling config.
 */
function shouldSample(level: LogLevel): boolean {
  const { rates } = clientSampling
  if (!rates) {
    return true
  }

  const percentage = level === 'error' && rates.error === undefined
    ? 100
    : rates[level] ?? 100

  if (percentage <= 0) return false
  if (percentage >= 100) return true

  return Math.random() * 100 < percentage
}

function emitClientWideEvent(level: LogLevel, event: Record<string, unknown>): void {
  if (!shouldSample(level)) {
    return
  }

  const formatted = {
    timestamp: new Date().toISOString(),
    level,
    service: clientService,
    ...event,
  }

  const method = getConsoleMethod(level)

  if (clientPretty) {
    const { level: lvl, service, ...rest } = formatted
    console[method](`%c[${service}]%c ${lvl}`, LEVEL_COLORS[lvl] || '', 'color: inherit', rest)
  } else {
    console[method](JSON.stringify(formatted))
  }
}

function emitClientTaggedLog(level: LogLevel, tag: string, message: string): void {
  if (clientPretty) {
    if (!shouldSample(level)) {
      return
    }
    console[getConsoleMethod(level)](`%c[${tag}]%c ${message}`, LEVEL_COLORS[level] || '', 'color: inherit')
  } else {
    emitClientWideEvent(level, { tag, message })
  }
}

function createLogMethod(level: LogLevel) {
  return function logMethod(tagOrEvent: string | Record<string, unknown>, message?: string): void {
    if (IS_CLIENT) {
      if (typeof tagOrEvent === 'string' && message !== undefined) {
        emitClientTaggedLog(level, tagOrEvent, message)
      } else if (typeof tagOrEvent === 'object') {
        emitClientWideEvent(level, tagOrEvent)
      } else {
        emitClientTaggedLog(level, 'log', String(tagOrEvent))
      }
    } else {
      import('../../logger').then(({ log: serverLog }) => {
        if (typeof tagOrEvent === 'string' && message !== undefined) {
          serverLog[level](tagOrEvent, message)
        } else if (typeof tagOrEvent === 'object') {
          serverLog[level](tagOrEvent)
        } else {
          serverLog[level]('log', String(tagOrEvent))
        }
      })
    }
  }
}

export const log: Log = {
  info: createLogMethod('info'),
  error: createLogMethod('error'),
  warn: createLogMethod('warn'),
  debug: createLogMethod('debug'),
}
