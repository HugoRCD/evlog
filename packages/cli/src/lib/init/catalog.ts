import type { ProjectFacts } from '../map/project-facts'
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
  /** Environment variables the adapter reads. Never prompted for — see the env note. */
  env: { name: string, hint: string }[]
  docs: string
  /**
   * Whether the drain is safe to leave on in production.
   *
   * The filesystem drain is not: it writes files on whatever box serves the
   * request. It is the default for development and never offered for production.
   */
  productionSafe: boolean
}

export const DESTINATIONS: readonly Destination[] = [
  {
    id: 'fs',
    label: 'Local files',
    hint: 'NDJSON under .evlog/logs — no account, works offline',
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

/** Destinations offered for local development — the file sink, or nothing. */
export const DEV_DESTINATIONS = DESTINATIONS.filter(d => d.id === 'fs' || d.id === 'none')

/**
 * Destinations offered for production.
 *
 * The filesystem drain is deliberately absent: it writes files on the box
 * serving the request, which is a local convenience and not a place anybody
 * reads production logs from.
 */
export const PROD_DESTINATIONS = DESTINATIONS.filter(d => d.productionSafe && d.id !== 'none')

/* ── enrichers ──────────────────────────────────────────────────────────── */

export type EnricherId = 'user-agent' | 'geo' | 'request-size' | 'trace-context'

export interface Enricher {
  id: EnricherId
  label: string
  hint: string
  factory: string
}

export const ENRICHERS: readonly Enricher[] = [
  {
    id: 'user-agent',
    label: 'User agent',
    hint: 'Browser, OS and device, parsed from the header',
    factory: 'createUserAgentEnricher()',
  },
  {
    id: 'geo',
    label: 'Geo',
    hint: 'Country and region from CDN headers — no lookup, no cost',
    factory: 'createGeoEnricher()',
  },
  {
    id: 'request-size',
    label: 'Request size',
    hint: 'Bytes in and out — cheap, and it finds the payloads nobody expected',
    factory: 'createRequestSizeEnricher()',
  },
  {
    id: 'trace-context',
    label: 'Trace context',
    hint: 'W3C traceparent, so events line up with your traces',
    factory: 'createTraceContextEnricher()',
  },
]

export const DEFAULT_ENRICHERS: readonly EnricherId[] = ['user-agent', 'geo', 'request-size', 'trace-context']

export function findEnricher(id: string): Enricher | undefined {
  return ENRICHERS.find(enricher => enricher.id === id)
}

/* ── sampling ───────────────────────────────────────────────────────────── */

export type SamplingProfile = 'all' | 'balanced' | 'high-traffic'

export interface SamplingPreset {
  id: SamplingProfile
  label: string
  hint: string
  /** `null` means "emit everything" — no sampling block is written. */
  rates: { info: number, warn: number, debug: number } | null
}

/**
 * Errors are absent from every preset on purpose.
 *
 * `error: 100` is written in all cases and is not a choice: a sampling config
 * that drops errors hides the only events anybody reads at three in the morning.
 */
export const SAMPLING_PRESETS: readonly SamplingPreset[] = [
  {
    id: 'all',
    label: 'Keep everything',
    hint: 'No sampling — the right answer until volume says otherwise',
    rates: null,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    hint: '25% of info, 5% of debug, every warning and error',
    rates: { info: 25, warn: 100, debug: 5 },
  },
  {
    id: 'high-traffic',
    label: 'High traffic',
    hint: '5% of info, 1% of debug — when info is the bulk of the bill',
    rates: { info: 5, warn: 100, debug: 1 },
  },
]

export function findSamplingPreset(id: string): SamplingPreset | undefined {
  return SAMPLING_PRESETS.find(preset => preset.id === id)
}

/* ── extras ─────────────────────────────────────────────────────────────── */

export type ExtraId =
  | 'enrichers'
  | 'pipeline'
  | 'sampling'
  | 'vite'
  | 'error-catalog'
  | 'audit-catalog'
  | 'ai'
  | 'better-auth'

/** Heading the extra is listed under in the picker. */
export type ExtraGroup = 'Context' | 'Delivery' | 'Catalogs' | 'Build' | 'Integrations'

export interface Extra {
  id: ExtraId
  group: ExtraGroup
  label: string
  hint: string
  docs: string
  /** Frameworks this makes sense for; omitted means all of them. */
  frameworks?: readonly Framework[]
  /** Only offered when production events actually leave the process. */
  requiresProdDrain?: true
}

export const EXTRAS: readonly Extra[] = [
  {
    id: 'enrichers',
    group: 'Context',
    label: 'Request enrichers',
    hint: 'User agent, geo, size, trace context — you pick which',
    docs: '/use-cases/enrichers',
  },
  {
    id: 'pipeline',
    group: 'Delivery',
    label: 'Batching and retry',
    hint: 'Buffer events and retry failed sends instead of one HTTP call per request',
    docs: '/extend/drain-pipeline',
    requiresProdDrain: true,
  },
  {
    id: 'sampling',
    group: 'Delivery',
    label: 'Sampling',
    hint: 'Keep every error, a fraction of the healthy traffic',
    docs: '/learn/sampling',
  },
  {
    id: 'error-catalog',
    group: 'Catalogs',
    label: 'Error catalog',
    hint: 'Turn the errors you already repeat across files into typed entries',
    docs: '/learn/catalogs',
  },
  {
    id: 'audit-catalog',
    group: 'Catalogs',
    label: 'Audit actions',
    hint: 'Typed actions for the sensitive routes that have no trail yet',
    docs: '/use-cases/audit/overview',
  },
  {
    id: 'vite',
    group: 'Build',
    label: 'Vite plugin',
    hint: 'Strip log.debug() from production builds, inject source locations',
    docs: '/reference/vite-plugin',
    frameworks: ['tanstack-start'],
  },
  {
    id: 'ai',
    group: 'Integrations',
    label: 'AI SDK logging',
    hint: 'Token usage, tool calls and cost on every generation',
    docs: '/use-cases/ai-sdk/overview',
  },
  {
    id: 'better-auth',
    group: 'Integrations',
    label: 'Auth identity',
    hint: 'Attach the signed-in user to every event automatically',
    docs: '/use-cases/better-auth/overview',
  },
]

export function findExtra(id: string): Extra | undefined {
  return EXTRAS.find(extra => extra.id === id)
}

/** What the project looks like, as far as deciding what to offer goes. */
export interface OfferContext {
  framework: Framework
  /** Production destinations chosen — empty means nothing leaves the process. */
  prodDrains: DrainId[]
  /** What the scan found, or `null` when it has not run. */
  facts: ProjectFacts | null
  /** Sensitive entry points with no audit trail, from the same scan. */
  auditGaps: number
}

/**
 * The extras worth showing for this project.
 *
 * Offers are filtered against what the project actually is: a flow that shows
 * four relevant options beats one that shows eight generic ones, and gating on
 * evidence is what makes the list read as "it looked at my code" rather than as
 * a menu. Integrations appear only when their package is installed, and the
 * catalogs only when the scan found something to seed them with.
 */
export function availableExtras(context: OfferContext): Extra[] {
  return EXTRAS.filter((extra) => {
    if (extra.frameworks && !extra.frameworks.includes(context.framework)) return false
    if (extra.requiresProdDrain && context.prodDrains.length === 0) return false

    switch (extra.id) {
      /* Integrations are pure pairing: without the package there is nothing to
         integrate with, and offering it anyway would be advertising. */
      case 'ai': return context.facts?.pairable.has('ai') ?? false
      case 'better-auth': return context.facts?.pairable.has('better-auth') ?? false
      /* One inline error is a local decision; the same one in three handlers is
         a catalog entry nobody has written yet. No repeats, no offer. */
      case 'error-catalog': return (context.facts?.repeatedErrors.size ?? 0) > 0
      case 'audit-catalog': return context.auditGaps > 0
      default: return true
    }
  })
}

/**
 * A count to put next to an offer, so the reason it is there is visible.
 *
 * "Error catalog (3 duplicated errors found)" is a different proposition from
 * "Error catalog": the first says the tool read the project, the second asks
 * the reader to take it on faith.
 */
export function offerEvidence(extra: Extra, context: OfferContext): string | null {
  switch (extra.id) {
    case 'error-catalog': {
      const count = context.facts?.repeatedErrors.size ?? 0
      return count > 0 ? `${count} repeated error${count === 1 ? '' : 's'} found` : null
    }
    case 'audit-catalog':
      return context.auditGaps > 0 ? `${context.auditGaps} sensitive route${context.auditGaps === 1 ? '' : 's'} with no trail` : null
    case 'ai': return 'ai is installed'
    case 'better-auth': return 'better-auth is installed'
    default: return null
  }
}
