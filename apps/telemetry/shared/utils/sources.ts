/**
 * Where a run came from.
 *
 * `@evlog/telemetry` accepts events from anything that reports to it — a CLI a
 * developer typed, a GitHub Actions job, a Vercel build, an AI coding agent, a
 * cron script. The raw event carries that as four loosely related fields
 * (`env.ci`, `env.provider`, `env.agent`, `env.tty`); this collapses them into
 * one dimension the dashboard can group, filter and colour by.
 *
 * Precedence is deliberate: *where* a run executed outranks *what* drove it, so
 * an agent running inside GitHub Actions counts as CI. Otherwise the CI column
 * would under-report every pipeline that happens to use an agent.
 * Auto-imported (Nuxt `shared/utils/` convention) on both sides.
 */

/** Fixed order — drives the composition bar's segments, whose colours are validated in that order. */
export const SOURCE_KINDS: readonly SourceKind[] = ['ci', 'agent', 'terminal', 'automation']

/** Stands in for a CI run whose provider the client could not identify. */
export const UNKNOWN_PROVIDER = 'unknown'

/** The environment fields a source is derived from — the subset of `EnvInfo` that matters here. */
export interface SourceEnv {
  ci: boolean
  provider: string | null
  agent: string | null
  tty: boolean
}

/** Classify one run's environment into its source. */
export function classifySource(env: SourceEnv): SourceRef {
  if (env.ci) return { kind: 'ci', id: env.provider ?? UNKNOWN_PROVIDER }
  if (env.agent) return { kind: 'agent', id: env.agent }
  return env.tty ? { kind: 'terminal', id: 'terminal' } : { kind: 'automation', id: 'automation' }
}

/**
 * URL/query token for a source — `ci:github_actions`, `agent:claude-code`,
 * `terminal`, `automation`. The kind is part of the token because ids only
 * make sense within their kind: nothing stops a CI provider and an agent from
 * sharing a name.
 */
export function sourceToken(source: SourceRef): string {
  return source.kind === 'terminal' || source.kind === 'automation' ? source.kind : `${source.kind}:${source.id}`
}

/** Inverse of {@link sourceToken} — `undefined` for anything malformed, so a hand-edited URL degrades to "no filter". */
export function parseSourceToken(token: string): SourceRef | undefined {
  if (token === 'terminal' || token === 'automation') return { kind: token, id: token }

  const separator = token.indexOf(':')
  if (separator === -1) return undefined

  const kind = token.slice(0, separator)
  const id = token.slice(separator + 1)
  if (!id) return undefined
  if (kind !== 'ci' && kind !== 'agent') return undefined

  return { kind, id }
}
