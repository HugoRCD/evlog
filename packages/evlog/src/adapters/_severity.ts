import type { LogLevel } from '../types'

export const OTEL_SEVERITY_NUMBER: Record<LogLevel, number> = {
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
}

export const OTEL_SEVERITY_TEXT: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
}
