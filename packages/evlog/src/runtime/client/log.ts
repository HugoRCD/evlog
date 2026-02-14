import type { Log, LogLevel, TransportConfig } from '../../types'
import { getConsoleMethod } from '../../utils'

const isClient = typeof window !== 'undefined'

let clientEnabled = true
let clientPretty = true
let clientService = 'client'
let transportEnabled = false
let transportEndpoint = '/api/_evlog/ingest'

const LEVEL_COLORS: Record<string, string> = {
  error: 'color: #ef4444; font-weight: bold',
  warn: 'color: #f59e0b; font-weight: bold',
  info: 'color: #06b6d4; font-weight: bold',
  debug: 'color: #6b7280; font-weight: bold',
}

export function initLog(options: { enabled?: boolean, pretty?: boolean, service?: string, transport?: TransportConfig } = {}): void {
  clientEnabled = typeof options.enabled === 'boolean' ? options.enabled : true
  clientPretty = typeof options.pretty === 'boolean' ? options.pretty : true
  clientService = options.service ?? 'client'
  transportEnabled = options.transport?.enabled ?? false
  transportEndpoint = options.transport?.endpoint ?? '/api/_evlog/ingest'
}

async function sendToServer(event: Record<string, unknown>): Promise<void> {
  if (!transportEnabled) return

  try {
    await fetch(transportEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
      credentials: 'same-origin',
    })
  } catch {
    // Silently fail - don't break the app
  }
}

function emitLog(level: LogLevel, event: Record<string, unknown>): void {
  if (!clientEnabled) return

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

  sendToServer(formatted)
}

function emitTaggedLog(level: LogLevel, tag: string, message: string): void {
  if (!clientEnabled) return
  if (clientPretty) {
    console[getConsoleMethod(level)](`%c[${tag}]%c ${message}`, LEVEL_COLORS[level] || '', 'color: inherit')
    sendToServer({
      timestamp: new Date().toISOString(),
      level,
      service: clientService,
      tag,
      message,
    })
  } else {
    emitLog(level, { tag, message })
  }
}

function createLogMethod(level: LogLevel) {
  return function logMethod(tagOrEvent: string | Record<string, unknown>, message?: string): void {
    if (!(import.meta.client ?? isClient)) {
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

const _clientLog: Log = {
  info: createLogMethod('info'),
  error: createLogMethod('error'),
  warn: createLogMethod('warn'),
  debug: createLogMethod('debug'),
}

export { _clientLog as log }
