/**
 * Execution context passed to every command.
 * The only place allowed to read `process.*` — commands stay pure and testable.
 *
 * Debug instrumentation uses {@link import('../lib/debug').CliDebug} from
 * {@link import('../lib/command').defineEvlogCommand}, not this object.
 */
export interface CliContext {
  /** Working directory used to resolve the host project. */
  cwd: string
  /** Environment snapshot — commands never touch `process.env` directly. */
  env: Record<string, string | undefined>
  /** Running Node.js version, e.g. `v22.1.0`. */
  nodeVersion: string
  /** Whether the terminal is interactive (stdout or stderr is a TTY). */
  tty: boolean
  /** Whether ANSI styling should be emitted. */
  color: boolean
  /** Terminal width in columns (80 when unknown). */
  columns: number
}

function isInteractive(): boolean {
  return process.stdout.isTTY === true || process.stderr.isTTY === true
}

function useColors(env: Record<string, string | undefined>, tty: boolean): boolean {
  if (env.NO_COLOR !== undefined) return false
  if (env.FORCE_COLOR === '1' || env.FORCE_COLOR === '2' || env.FORCE_COLOR === '3') return true
  return tty
}

/**
 * Build the {@link CliContext} for the current process.
 * Pass `overrides` in tests to fake cwd, env, or terminal capabilities.
 */
export function createContext(overrides: Partial<CliContext> = {}): CliContext {
  const env = overrides.env ?? { ...process.env }
  const tty = overrides.tty ?? isInteractive()
  return {
    cwd: overrides.cwd ?? process.cwd(),
    env,
    nodeVersion: overrides.nodeVersion ?? process.version,
    tty,
    color: overrides.color ?? useColors(env, tty),
    columns: overrides.columns ?? process.stdout.columns ?? process.stderr.columns ?? 80,
  }
}
