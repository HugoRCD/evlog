import type { Framework } from '../map/types'

/**
 * Everything `init` can offer, as data.
 *
 * One catalog drives both surfaces: the prompts render from it, and
 * `--drain` / `--extras` validate against it. Splitting them is how an
 * interactive flow and its flags drift until an agent cannot reproduce what a
 * human just did.
 */

export type DrainId =
  | 'fs'
  | 'axiom'
  | 'otlp'
  | 'posthog'
  | 'sentry'
  | 'better-stack'
  | 'datadog'
  | 'hyperdx'
  | 'none'

export interface Destination {
  id: DrainId
  label: string
  /** One line under the label in the picker — what you get, not what it is. */
  hint: string
  /** Import specifier, `null` for the console-only choice. */
  specifier: string | null
  /** Factory to call in the generated code. */
  factory: string | null
  /** Environment variables the adapter reads. Never prompted for — see `writeEnvExample`. */
  env: { name: string, hint: string }[]
  docs: string
  /**
   * Whether the drain is safe to leave on in production.
   *
   * The filesystem drain is not: it writes files on whatever box serves the
   * request. Generated code gates that one on development.
   */
  productionSafe: boolean
}

export const DESTINATIONS: readonly Destination[] = [
  {
    id: 'fs',
    label: 'Local files',
    hint: 'NDJSON under .evlog/logs — no account, works offline, development only',
    specifier: 'evlog/fs',
    factory: 'createFsDrain()',
    env: [],
    docs: '/integrate/adapters/self-hosted/fs',
    productionSafe: false,
  },
  {
    id: 'axiom',
    label: 'Axiom',
    hint: 'Wide events you can query with APL',
    specifier: 'evlog/axiom',
    factory: 'createAxiomDrain()',
    env: [
      { name: 'AXIOM_DATASET', hint: 'dataset to write to' },
      { name: 'AXIOM_API_KEY', hint: 'API token with ingest permission' },
    ],
    docs: '/integrate/adapters/cloud/axiom',
    productionSafe: true,
  },
  {
    id: 'otlp',
    label: 'OpenTelemetry (OTLP)',
    hint: 'Any OTLP collector — vendor-neutral',
    specifier: 'evlog/otlp',
    factory: 'createOTLPDrain()',
    env: [
      { name: 'OTEL_EXPORTER_OTLP_ENDPOINT', hint: 'collector URL' },
      { name: 'OTEL_SERVICE_NAME', hint: 'defaults to your evlog service name' },
    ],
    docs: '/integrate/adapters/cloud/otlp',
    productionSafe: true,
  },
  {
    id: 'posthog',
    label: 'PostHog',
    hint: 'Product analytics and logs in one place',
    specifier: 'evlog/posthog',
    factory: 'createPostHogDrain()',
    env: [
      { name: 'POSTHOG_API_KEY', hint: 'project API key' },
      { name: 'POSTHOG_HOST', hint: 'defaults to PostHog cloud' },
    ],
    docs: '/integrate/adapters/cloud/posthog',
    productionSafe: true,
  },
  {
    id: 'sentry',
    label: 'Sentry',
    hint: 'Errors with the full wide event attached',
    specifier: 'evlog/sentry',
    factory: 'createSentryDrain()',
    env: [{ name: 'SENTRY_DSN', hint: 'project DSN' }],
    docs: '/integrate/adapters/cloud/sentry',
    productionSafe: true,
  },
  {
    id: 'better-stack',
    label: 'Better Stack',
    hint: 'Logtail ingest with live tail',
    specifier: 'evlog/better-stack',
    factory: 'createBetterStackDrain()',
    env: [{ name: 'BETTER_STACK_API_KEY', hint: 'source token' }],
    docs: '/integrate/adapters/cloud/better-stack',
    productionSafe: true,
  },
  {
    id: 'datadog',
    label: 'Datadog',
    hint: 'Logs intake, correlated with your APM traces',
    specifier: 'evlog/datadog',
    factory: 'createDatadogDrain()',
    env: [
      { name: 'DATADOG_API_KEY', hint: 'API key' },
      { name: 'DATADOG_SITE', hint: 'e.g. datadoghq.eu' },
    ],
    docs: '/integrate/adapters/cloud/datadog',
    productionSafe: true,
  },
  {
    id: 'hyperdx',
    label: 'HyperDX',
    hint: 'OTLP-native, session replay alongside logs',
    specifier: 'evlog/hyperdx',
    factory: 'createHyperDXDrain()',
    env: [{ name: 'HYPERDX_API_KEY', hint: 'ingestion key' }],
    docs: '/integrate/adapters/cloud/hyperdx',
    productionSafe: true,
  },
  {
    id: 'none',
    label: 'Nothing yet',
    hint: 'Pretty console output only — wire a drain when you are ready',
    specifier: null,
    factory: null,
    env: [],
    docs: '/integrate/adapters/overview',
    productionSafe: true,
  },
]

export function findDestination(id: string): Destination | undefined {
  return DESTINATIONS.find(destination => destination.id === id)
}

export type ExtraId = 'enrichers' | 'pipeline' | 'sampling' | 'vite'

export interface Extra {
  id: ExtraId
  label: string
  hint: string
  docs: string
  /** Frameworks this makes sense for; omitted means all of them. */
  frameworks?: readonly Framework[]
  /** Only offered when a real drain was chosen. */
  requiresDrain?: true
}

export const EXTRAS: readonly Extra[] = [
  {
    id: 'enrichers',
    label: 'Request enrichers',
    hint: 'User agent, geo, request size and trace context on every event',
    docs: '/use-cases/enrichers',
    frameworks: ['nuxt', 'nitro', 'tanstack-start'],
  },
  {
    id: 'pipeline',
    label: 'Batching and retry',
    hint: 'Buffer events and retry failed sends instead of one HTTP call per request',
    docs: '/extend/drain-pipeline',
    requiresDrain: true,
  },
  {
    id: 'sampling',
    label: 'Sampling',
    hint: 'Keep every error, a fraction of the healthy traffic',
    docs: '/learn/sampling',
    frameworks: ['nuxt', 'nitro', 'tanstack-start'],
  },
  {
    id: 'vite',
    label: 'Vite plugin',
    hint: 'Strip log.debug() from production builds, inject source locations',
    docs: '/reference/vite-plugin',
    frameworks: ['tanstack-start'],
  },
]

/** Extras that apply to this framework and drain choice. */
export function availableExtras(framework: Framework, drain: DrainId): Extra[] {
  return EXTRAS.filter((extra) => {
    if (extra.frameworks && !extra.frameworks.includes(framework)) return false
    if (extra.requiresDrain && (drain === 'none' || drain === 'fs')) return false
    return true
  })
}

export function findExtra(id: string): Extra | undefined {
  return EXTRAS.find(extra => extra.id === id)
}
