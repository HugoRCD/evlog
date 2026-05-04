export {
  AUDIT_SCHEMA_VERSION,
  AuditDeniedError,
  audit,
  auditDiff,
  auditEnricher,
  auditOnly,
  auditRedactPreset,
  buildAuditFields,
  defineAuditAction,
  mockAudit,
  signed,
  withAudit,
  withAuditMethods,
} from './audit'
export type {
  AuditDiffOptions,
  AuditEnricherOptions,
  AuditInput,
  AuditMatcher,
  AuditMethod,
  AuditOnlyOptions,
  AuditPatchOp,
  AuditableLogger,
  DefinedAuditAction,
  DrainFn,
  MockAudit,
  SignedChainState,
  SignedOptions,
  WithAuditContext,
  WithAuditOptions,
} from './audit'
export { EvlogError, createError, createEvlogError } from './error'
export { createLogger, createRequestLogger, getEnvironment, initLogger, isEnabled, log, shouldKeep } from './logger'
export { isLevelEnabled } from './utils'
export { useLogger } from './runtime/server/useLogger'
export { parseError } from './runtime/utils/parseError'

// Building blocks promoted from `evlog/toolkit` for ergonomics on the canonical
// entrypoint. The toolkit subpath remains the comprehensive one.
export { definePlugin, drainPlugin, enricherPlugin } from './shared/plugin'
export type {
  ClientLogContext,
  EvlogPlugin,
  PluginRunner,
  PluginSetupContext,
  RequestFinishContext,
  RequestLifecycleContext,
} from './shared/plugin'
export { defineEvlog, toLoggerConfig, toMiddlewareOptions } from './shared/define'
export type { EvlogConfig } from './shared/define'

export type {
  AuditActor,
  AuditFields,
  AuditLoggerMethod,
  AuditTarget,
  BaseWideEvent,
  DeepPartial,
  DrainContext,
  EnrichContext,
  EnvironmentContext,
  ErrorOptions,
  FieldContext,
  H3EventContext,
  IngestPayload,
  InternalFields,
  Log,
  LoggerConfig,
  LogLevel,
  ParsedError,
  RedactConfig,
  RequestLogger,
  RequestLoggerOptions,
  SamplingConfig,
  SamplingRates,
  ServerEvent,
  TailSamplingCondition,
  TailSamplingContext,
  TransportConfig,
  WideEvent,
} from './types'
