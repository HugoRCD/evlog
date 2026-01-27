export { EvlogError, createError, createEvlogError } from './error'
export { createRequestLogger, getEnvironment, initLogger, log } from './logger'
export { useLogger } from './runtime/server/useLogger'
export { parseError } from './runtime/utils/parseError'

export type {
  BaseWideEvent,
  EnvironmentContext,
  ErrorOptions,
  H3EventContext,
  Log,
  LoggerConfig,
  LogLevel,
  ParsedError,
  RequestLogger,
  RequestLoggerOptions,
  SamplingConfig,
  SamplingRates,
  ServerEvent,
  WideEvent,
} from './types'
