import { execFileSync } from 'node:child_process'

/** PostHog EU project 245589 (evlog). Public id, not a secret. */
export const DOCS_POSTHOG_PROJECT_ID = '245589'
export const DOCS_POSTHOG_CLI_HOST = 'https://eu.posthog.com'
export const SOURCEMAP_DIRECTORY = '.output'

export type SourceMapUploadDecision = 'upload' | 'skip-no-key' | 'skip-not-production'

export type SourceMapExec = (
  file: string,
  args: readonly string[],
  options: { stdio: 'inherit', env: NodeJS.ProcessEnv },
) => void

export function decideSourceMapUpload(env: {
  POSTHOG_CLI_API_KEY?: string
  VERCEL_ENV?: string
}): SourceMapUploadDecision {
  if (!env.POSTHOG_CLI_API_KEY) return 'skip-no-key'
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') return 'skip-not-production'
  return 'upload'
}

export function sourcemapCliArgs(host: string): { inject: string[], upload: string[] } {
  return {
    inject: ['--host', host, 'sourcemap', 'inject', '--directory', SOURCEMAP_DIRECTORY],
    upload: ['--host', host, 'sourcemap', 'upload', '--directory', SOURCEMAP_DIRECTORY, '--delete-after'],
  }
}

/**
 * Inject chunk ids and upload client maps to PostHog, then delete the `.map`
 * files so they are not served. No-op without `POSTHOG_CLI_API_KEY`, and on
 * Vercel preview/dev deploys.
 */
export function uploadDocsSourceMaps(
  env: NodeJS.ProcessEnv = process.env,
  exec: SourceMapExec = execFileSync,
): SourceMapUploadDecision {
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
  const args = sourcemapCliArgs(host)

  exec('posthog-cli', args.inject, { stdio: 'inherit', env: cliEnv })
  exec('posthog-cli', args.upload, { stdio: 'inherit', env: cliEnv })
  return decision
}
