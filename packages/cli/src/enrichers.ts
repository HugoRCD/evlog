import type { RequestLogger } from 'evlog'

/** Fields merged into the wide event under `cli.*`. */
export interface CliContextFields {
  command: string
  argv?: string[]
  flags?: Record<string, unknown>
  version?: string
}

/**
 * Build CLI context fields for a command invocation.
 */
export function buildCliContext(options: CliContextFields): Record<string, unknown> {
  return {
    cli: {
      command: options.command,
      argv: options.argv,
      flags: options.flags,
      version: options.version,
      tty: {
        stdin: !!process.stdin.isTTY,
        stdout: !!process.stdout.isTTY,
        stderr: !!process.stderr.isTTY,
      },
      platform: process.platform,
      node: process.version,
      ci: process.env.CI === 'true' || process.env.CI === '1',
    },
  }
}

/** Attach CLI context to a request logger before the handler runs. */
export function applyCliContext(logger: RequestLogger, options: CliContextFields): void {
  logger.set(buildCliContext(options) as never)
}
