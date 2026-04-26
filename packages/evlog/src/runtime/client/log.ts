import type { Log, LogLevel, TransportConfig } from '../../types'
import { cssColors, escapeFormatString, getCssLevelColor, isBrowser, isLevelEnabled } from '../../utils'

/**
 * Browser DevTools often hide or bucket `console.debug` under "Verbose" in a way that looks like
 * nothing happened. Use `console.log` for debug-level client output so it shows with the default
 * Info filter; the structured payload still has `level: 'debug'`.
 */
function browserConsoleMethod(level: LogLevel): 'log' | 'info' | 'warn' | 'error' {
  if (level === 'debug') return 'log'
  return level as 'info' | 'warn' | 'error'
}

let clientEnabled = true
let clientConsole = true
let clientPretty = true
let clientMinLevel: LogLevel = 'debug'
let clientService = 'client'
let transportEnabled = false
let transportEndpoint = '/api/_evlog/ingest'
let transportCredentials: RequestCredentials = 'same-origin'
let identityContext: Record<string, unknown> = {}

export function setIdentity(identity: Record<string, unknown>): void {
  identityContext = { ...identity }
}

export function clearIdentity(): void {
  identityContext = {}
}


export function initLog(options: { enabled?: boolean, console?: boolean, pretty?: boolean, minLevel?: LogLevel, service?: string, transport?: TransportConfig } = {}): void {
  clientEnabled = typeof options.enabled === 'boolean' ? options.enabled : true
  clientConsole = typeof options.console === 'boolean' ? options.console : true
  clientPretty = typeof options.pretty === 'boolean' ? options.pretty : true
  clientMinLevel = options.minLevel ?? 'debug'
  clientService = options.service ?? 'client'
  transportEnabled = options.transport?.enabled ?? false
  transportEndpoint = options.transport?.endpoint ?? '/api/_evlog/ingest'
  transportCredentials = options.transport?.credentials ?? 'same-origin'
}

/**
 * Update the minimum log level at runtime (e.g. enable verbose client logs from a debug toggle).
 */
export function setMinLevel(level: LogLevel): void {
  clientMinLevel = level
}

async function sendToServer(event: Record<string, unknown>): Promise<void> {
  if (!transportEnabled) return

  try {
    await fetch(transportEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
      credentials: transportCredentials,
    })
  } catch {
    // Silently fail - don't break the app
  }
}

function emitLog(level: LogLevel, event: Record<string, unknown>): void {
  if (!clientEnabled) return
  if (!isLevelEnabled(level, clientMinLevel)) return

  const formatted = {
    timestamp: new Date().toISOString(),
    level,
    service: clientService,
    ...identityContext,
    ...event,
  }

  if (clientConsole) {
    const method = browserConsoleMethod(level)
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
  if (!isLevelEnabled(level, clientMinLevel)) return
  if (clientPretty) {
    if (clientConsole) {
      console[browserConsoleMethod(level)](`%c[${escapeFormatString(tag)}]%c ${escapeFormatString(message)}`, getCssLevelColor(level), cssColors.reset)
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
    // Call-time check: avoid relying on import.meta.client (can be false in some mixed bundles).
    if (!isBrowser()) {
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
