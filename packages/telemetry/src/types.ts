/**
 * Outcome of a single tool run captured by {@link createTelemetry}.
 */
export type RunOutcome = 'success' | 'error'

/**
 * Tool identity attached to every telemetry run event.
 */
export interface ToolInfo {
  name: string
  version: string
}

/**
 * Environment snapshot enriched via `std-env`.
 */
export interface EnvInfo {
  node: string
  ci: boolean
  provider: string | null
  tty: boolean
  agent: string | null
}

/**
 * Standard wide-event envelope for one CLI/tool run.
 * Defined by @evlog/telemetry — consumers only extend `custom` via {@link telemetry.set}.
 */
export interface RunEvent {
  event: 'run'
  command: string
  durationMs: number
  outcome: RunOutcome
  errorCode?: string
  flags: Record<string, boolean | number | string>
  tool: ToolInfo
  env: EnvInfo
  machineId?: string
  custom: Record<string, boolean | number | string>
  idempotencyKey: string
  timestamp: string
}

/** Allowlisted string flag values declared via `collect.flags`. */
export type CollectFlags = Record<string, readonly string[]>

/** Allowlisted string custom fields declared via `collect.fields`. */
export type CollectFields = Record<string, readonly string[]>

/**
 * Optional collection declaration — inline, no separate config file.
 * Closed sets only; undeclared string values become presence-only at runtime.
 */
export interface CollectConfig<
  TFlags extends CollectFlags = {},
  TFields extends CollectFields = {},
> {
  flags?: TFlags
  fields?: TFields
}

/**
 * Options passed to {@link createTelemetry} and {@link withTelemetry}.
 */
export interface TelemetryOptions<
  TFlags extends CollectFlags = {},
  TFields extends CollectFields = {},
> {
  /** Telemetry tool name, e.g. `evlog-cli`. Used for config dir and disclosure. */
  name: string
  /** Tool version string. */
  version: string
  /** Default ingestion endpoint baked in by the author. Overridable via `EVLOG_TELEMETRY_ENDPOINT`. */
  endpoint?: string
  /** Optional allowlists for string flags and custom fields. */
  collect?: CollectConfig<TFlags, TFields>
  /** Hard cap (ms) for {@link TelemetryHandle.flush}. Default: 500. */
  flushTimeoutMs?: number
  /** Max outbox file size in bytes before oldest events are dropped. Default: 1 MiB. */
  maxBufferBytes?: number
  /** Max age (ms) for buffered events. Default: 30 days. */
  maxEventAgeMs?: number
  /**
   * Sampling rate 0–1. Declared for future use — v1 always records.
   * @internal Not implemented in v1.
   */
  sampling?: number
}

type CustomFieldValue<T extends readonly string[] | undefined> =
  T extends readonly (infer S extends string)[] ? boolean | number | S : boolean | number

/**
 * Custom fields accepted by {@link telemetry.set} — numbers and booleans always;
 * strings only when declared in `collect.fields` (enforced at runtime).
 */
export type CustomFields<TFields extends CollectFields = {}> = {
  [K in string]: K extends keyof TFields
    ? CustomFieldValue<TFields[K]>
    : boolean | number | undefined
}

/** Error shape recognised for automatic `errorCode` capture. */
export interface TelemetryCliError {
  code: string
  message?: string
}

/**
 * Handle returned by {@link createTelemetry}.
 */
export interface TelemetryHandle<
  TFlags extends CollectFlags = {},
  TFields extends CollectFields = {},
> {
  /** Run an async unit of work as a single telemetry event. */
  run: <T>(
    command: string,
    fn: () => T | Promise<T>,
    opts?: { flags?: Record<string, unknown>, systemCustom?: Record<string, string> },
  ) => Promise<T>
  /** Flush buffered events within the hard cap. Never throws. */
  flush: () => Promise<void>
  /** Whether telemetry is active (consent granted). */
  enabled: boolean
  /**
   * Set custom fields for the active run.
   * Prefer this over the ambient {@link telemetry.set} for allowlisted string autocomplete.
   */
  set: (fields: CustomFields<TFields>) => void
}

/** @internal Mutable run context stored in ALS during `run()`. */
export interface RunContext {
  custom: Record<string, boolean | number | string>
  collect?: CollectConfig
}
