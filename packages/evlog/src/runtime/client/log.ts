import type { Log, LogLevel } from '../../types'
import { getConsoleMethod } from '../../utils'

let clientPretty = true
let clientService = 'client'

const LEVEL_COLORS: Record<string, string> = {
  error: 'color: #ef4444; font-weight: bold',
  warn: 'color: #f59e0b; font-weight: bold',
  info: 'color: #06b6d4; font-weight: bold',
  debug: 'color: #6b7280; font-weight: bold',
}

export function initLog(options: { pretty?: boolean, service?: string } = {}): void {
  clientPretty = options.pretty ?? true
  clientService = options.service ?? 'client'
}

function emitLog(level: LogLevel, event: Record<string, unknown>): void {
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

function emitTaggedLog(level: LogLevel, tag: string, message: string): void {
  if (clientPretty) {
    console[getConsoleMethod(level)](`%c[${tag}]%c ${message}`, LEVEL_COLORS[level] || '', 'color: inherit')
  } else {
    emitLog(level, { tag, message })
  }
}

function createLogMethod(level: LogLevel) {
  return function logMethod(tagOrEvent: string | Record<string, unknown>, message?: string): void {
    if (!import.meta.client) {
      return
    }

    if (typeof tagOrEvent === 'string' && message !== undefined) {
      emitTaggedLog(level, tagOrEvent, message)
    } else if (typeof tagOrEvent === 'object') {
      emitLog(level, tagOrEvent)
    } else {
      emitTaggedLog(level, 'log', String(tagOrEvent))
    }
  }
}

export const log: Log = {
  info: createLogMethod('info'),
  error: createLogMethod('error'),
  warn: createLogMethod('warn'),
  debug: createLogMethod('debug'),
}
