import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/** PostHog EU project 245589 (evlog). Public id, not a secret. */
export const DOCS_POSTHOG_PROJECT_ID = '245589'
export const DOCS_POSTHOG_CLI_HOST = 'https://eu.posthog.com'
export const SOURCEMAP_DIRECTORY = '.output'

export type SourceMapUploadDecision = 'upload' | 'skip-no-key' | 'skip-not-production'

export type SourceMapExec = (
  file: string,
  args: readonly string[],
  options: { cwd: string, env: NodeJS.ProcessEnv, stdio: 'inherit' },
) => void

export function resolvePosthogCli(): string {
  return join(dirname(require.resolve('@posthog/cli/package.json')), 'run-posthog-cli.js')
}

export function decideSourceMapUpload(env: {
  POSTHOG_CLI_API_KEY?: string
  VERCEL_ENV?: string
}): SourceMapUploadDecision {
  if (!env.POSTHOG_CLI_API_KEY) return 'skip-no-key'
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') return 'skip-not-production'
  return 'upload'
}

export function sourcemapCliArgs(directory: string): { inject: string[], upload: string[] } {
  return {
    inject: ['sourcemap', 'inject', '--directory', directory],
    upload: ['sourcemap', 'upload', '--directory', directory, '--delete-after'],
  }
}

/**
 * Inject chunk ids and upload client maps to PostHog, then delete the `.map`
 * files so they are not served. No-op without `POSTHOG_CLI_API_KEY`, and on
 * Vercel preview/dev deploys.
 */
export function uploadDocsSourceMaps(options: {
  env?: NodeJS.ProcessEnv
  exec?: SourceMapExec
  cwd?: string
} = {}): SourceMapUploadDecision {
  const env = options.env ?? process.env
  const exec = options.exec ?? execFileSync
  const cwd = options.cwd ?? process.cwd()

  const decision = decideSourceMapUpload({
    POSTHOG_CLI_API_KEY: env.POSTHOG_CLI_API_KEY,
    VERCEL_ENV: env.VERCEL_ENV,
  })

  if (decision === 'skip-no-key') {
    if (env.VERCEL_ENV === 'production') {
      console.error('[posthog] POSTHOG_CLI_API_KEY is unset; docs source maps were not uploaded')
    }
    return decision
  }

  if (decision === 'skip-not-production') return decision

  const host = env.POSTHOG_CLI_HOST || DOCS_POSTHOG_CLI_HOST
  const cliEnv = {
    ...env,
    POSTHOG_CLI_HOST: host,
    POSTHOG_CLI_PROJECT_ID: env.POSTHOG_CLI_PROJECT_ID || DOCS_POSTHOG_PROJECT_ID,
  }
  const args = sourcemapCliArgs(SOURCEMAP_DIRECTORY)
  const cli = resolvePosthogCli()

  exec(process.execPath, [cli, ...args.inject], { cwd, env: cliEnv, stdio: 'inherit' })
  exec(process.execPath, [cli, ...args.upload], { cwd, env: cliEnv, stdio: 'inherit' })
  return decision
}
