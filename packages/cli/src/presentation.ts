/** citty arg for `--log` — auto-injected by {@link runMain} from `@evlog/cli/citty`. */
export const evlogLogArg = {
  log: {
    type: 'boolean' as const,
    description: 'Print emitted wide events to stderr (debug)',
  },
} as const

/**
 * Whether evlog should echo wide events on stderr.
 * Enabled by `--log` on argv or `logToConsole: true` in config.
 */
export function shouldLogToConsole(
  argv: string[] = process.argv.slice(2),
  configLogToConsole?: boolean,
): boolean {
  if (configLogToConsole) return true
  return argv.includes('--log')
}

/** Map log-to-console flag to evlog console settings. */
export function logToConsoleFlags(enabled: boolean): {
  pretty?: boolean
  silent?: boolean
} {
  return enabled
    ? { pretty: true, silent: false }
    : { pretty: false, silent: true }
}
