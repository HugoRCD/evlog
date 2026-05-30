import { parseError } from 'evlog'
import { extractErrorStatus } from 'evlog/toolkit'
import type { ParsedCliError } from './types'

function readInternal(err: unknown): Record<string, unknown> | undefined {
  if (!err || typeof err !== 'object') return undefined
  const { internal } = err as { internal?: unknown }
  return internal && typeof internal === 'object' && !Array.isArray(internal)
    ? internal as Record<string, unknown>
    : undefined
}

function resolveExitCode(status: number | undefined): number {
  if (status === undefined) return 1
  if (status >= 0 && status < 256) return status
  return 1
}

/**
 * Parse an error for CLI output — extends evlog's {@link parseError} with
 * `hint` (from `fix` or `internal.hint`) and a process `exitCode`.
 */
export function parseCliError(err: unknown): ParsedCliError {
  const parsed = parseError(err)
  const internal = readInternal(err)
  const hint = parsed.fix
    ?? (typeof internal?.hint === 'string' ? internal.hint : undefined)

  return {
    ...parsed,
    code: parsed.code ?? 'UNKNOWN',
    hint,
    exitCode: resolveExitCode(parsed.status ?? extractErrorStatus(err)),
    raw: parsed.raw,
  }
}

/**
 * Print a human-readable error on stderr, then `process.exit`.
 */
export function exitWithError(err: unknown): never {
  const parsed = parseCliError(err)

  console.error(parsed.message)
  if (parsed.hint) console.error(parsed.hint)

  process.exit(parsed.exitCode ?? 1)
}
