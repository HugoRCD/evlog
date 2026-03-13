import type { Log, LogLevel, TransportConfig } from '../../types'
import { cssColors, escapeFormatString, getConsoleMethod, getCssLevelColor } from '../../utils'

const isClient = typeof window !== 'undefined'

let clientEnabled = true
let clientConsole = true
let clientPretty = true
let clientService = 'client'
let transportEnabled = false
let transportEndpoint = '/api/_evlog/ingest'
let identityContext: Record<string, unknown> = {}

export function setIdentity(identity: Record<string, unknown>): void {
  identityContext = { ...identity }
}

export function clearIdentity(): void {
  identityContext = {}
}


export function initLog(options: { enabled?: boolean, console?: boolean, pretty?: boolean, service?: string, transport?: TransportConfig } = {}): void {
  clientEnabled = typeof options.enabled === 'boolean' ? options.enabled : true
  clientConsole = typeof options.console === 'boolean' ? options.console : true
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
    ...identityContext,
    ...event,
  }

  if (clientConsole) {
    const method = getConsoleMethod(level)
    if (clientPretty) {
      const { level: lvl, service, ...rest } = formatted
      console[method](`%c[${escapeFormatString(String(service))}]%c ${lvl}`, getCssLevelColor(lvl), cssColors.reset, rest)
    } else {
      console[method](JSON.stringify(formatted))
    }
  }

  sendToServer(formatted)
}

function emitTaggedLog(level: LogLevel, tag: string, message: string): void {
  if (!clientEnabled) return
  if (clientPretty) {
    if (clientConsole) {
      console[getConsoleMethod(level)](`%c[${escapeFormatString(tag)}]%c ${escapeFormatString(message)}`, getCssLevelColor(level), cssColors.reset)
    }
    sendToServer({
      timestamp: new Date().toISOString(),
      level,
      service: clientService,
      ...identityContext,
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
