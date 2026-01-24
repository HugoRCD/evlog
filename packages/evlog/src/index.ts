export { EvlogError, defineError } from './error'
export { createRequestLogger, getEnvironment, initLogger, initLoggerSync, log } from './logger'
export { clientLog, initClientLogger } from './client'
export { colors, detectEnvironment, formatDuration, getLevelColor, isDev, isClient, isServer, getPackageInfo } from './utils'
export { useLogger } from './runtime/composables/useLogger'

export type {
  BaseWideEvent,
  EnvironmentContext,
  ErrorOptions,
  EvlogEventContext,
  Log,
  LoggerConfig,
  LogLevel,
  RequestLogger,
  WideEvent,
} from './types'
