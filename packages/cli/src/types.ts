import type { EvlogConfig } from 'evlog'

/** Per-command context passed to the CLI integration. */
export interface CliContext {
  command: string
  argv?: string[]
  flags?: Record<string, unknown>
}

/** Options for {@link EvlogSetup.invoke}. */
export interface InvokeOptions {
  /** Command path segment, e.g. `run` or `doctor`. */
  command: string
  /** Parsed argv without the node binary. */
  argv?: string[]
  /** Parsed flags (redacted before they reach the wide event). */
  flags?: Record<string, unknown>
  /**
   * When true, skip auto-emit on successful return — call `log.emit()` manually
   * (long-running commands, REPLs, watch mode).
   */
  longRunning?: boolean
}

/** Config for {@link setupEvlog} — observability for your existing CLI. */
export interface EvlogSetupConfig extends EvlogConfig {
  /** Binary version injected into `cli.version`. */
  version?: string
  /** Registered error catalog exposed on the returned setup handle. */
  errorCatalog?: unknown
  /** Registered audit catalog exposed on the returned setup handle. */
  auditCatalog?: unknown
  /** Merge {@link cliRedactPreset} with {@link auditRedactPreset} when true. @default true */
  redact?: boolean | import('evlog').RedactConfig
  /** Flush pipeline drains on `beforeExit` / SIGINT / SIGTERM. @default true */
  flushOnExit?: boolean
  /**
   * Print emitted wide events to stderr (same as passing `--log`).
   * @default false — drain only; evlog console silent
   */
  logToConsole?: boolean
}

/** Options for {@link createCommandLogger} (level 0 — no global bootstrap). */
export interface CreateCommandLoggerOptions {
  command: string
  argv?: string[]
  flags?: Record<string, unknown>
  version?: string
}

/** Parsed CLI error with stable code and optional exit code. */
export interface ParsedCliError {
  message: string
  status: number
  code: string
  why?: string
  fix?: string
  hint?: string
  link?: string
  exitCode?: number
  raw: unknown
}

/** Handle returned by {@link setupEvlog} — lifecycle + catalogs, not the command logger. */
export interface EvlogSetup {
  invoke<T>(options: InvokeOptions, fn: (log: import('evlog').AuditableLogger) => T | Promise<T>): Promise<T>
  log: import('evlog').Log
  errorCatalog?: unknown
  auditCatalog?: unknown
  audit: (input: import('evlog').AuditInput) => void
  flush: () => Promise<void>
}
