/**
 * Deploy / runtime stage for the CLI itself.
 *
 * Not the user's app env — whether *this* `evlog` binary is a local workspace
 * build or a packaged install (`npx`, dependency, global).
 */
export type CliEnvironment = 'development' | 'preview' | 'production' | string

export type ResolveCliEnvironmentOptions = {
  /** Process env (defaults to `process.env`). */
  env?: NodeJS.Dict<string>
  /**
   * Module URL used to detect packaged vs workspace installs.
   * Defaults to this file's `import.meta.url`.
   */
  moduleUrl?: string
}

/**
 * True when the CLI is running from a published / installed package
 * (`node_modules/.../@evlog/cli`), not from the monorepo `packages/cli` tree.
 */
export function isPackagedCli(moduleUrl: string = import.meta.url): boolean {
  const normalized = moduleUrl.replace(/\\/g, '/')
  if (normalized.includes('/node_modules/')) return true
  if (normalized.includes('/packages/cli/')) return false
  // Unknown install path (custom global, bundled) → treat as packaged.
  return true
}

/**
 * Resolve the CLI's own environment for `--json`, `--debug`, and telemetry.
 *
 * Priority:
 * 1. `EVLOG_CLI_ENV` (explicit override)
 * 2. `VERCEL_ENV` (when the CLI runs on Vercel: production | preview | development)
 * 3. Packaged install → `production` (users running published `evlog`)
 * 4. Workspace / local → `NODE_ENV` or `development`
 */
export function resolveCliEnvironment(
  options: ResolveCliEnvironmentOptions = {},
): CliEnvironment {
  const env = options.env ?? process.env
  const moduleUrl = options.moduleUrl ?? import.meta.url

  const explicit = env.EVLOG_CLI_ENV?.trim()
  if (explicit) return explicit

  const vercel = env.VERCEL_ENV?.trim()
  if (vercel) return vercel

  if (isPackagedCli(moduleUrl)) return 'production'

  return env.NODE_ENV?.trim() || 'development'
}
