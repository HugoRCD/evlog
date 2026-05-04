import type { WideEvent } from '../types'
import type { ConfigField } from '../shared/config'
import { resolveAdapterConfig } from '../shared/config'
import { defineHttpDrain } from '../shared/drain'
import { httpPost } from '../shared/http'

interface BaseAxiomConfig {
  /** Axiom dataset name. */
  dataset: string
  /**
   * Axiom API key.
   *
   * @example `xaat-...`
   */
  apiKey: string
  /**
   * @deprecated Renamed to {@link BaseAxiomConfig.apiKey}. Will be removed in
   * the next major version. Pass `apiKey` instead.
   */
  token?: string
  /** Organization ID (required for Personal Access Tokens). */
  orgId?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
  /** Number of retry attempts on transient failures. Default: 2 */
  retries?: number
}

interface EdgeAxiomConfig {
  /**
   * Edge URL for Axiom ingest/query endpoints.
   * If no path is provided, uses /v1/ingest/{dataset}.
   * If a custom path is provided, it is used as-is (trailing slash trimmed).
   */
  edgeUrl: string
  /** Mutually exclusive with edgeUrl. */
  baseUrl?: never
}

interface EndpointAxiomConfig {
  /** Base URL for Axiom API. Uses /v1/datasets/{dataset}/ingest. */
  baseUrl?: string
  /** Mutually exclusive with baseUrl. */
  edgeUrl?: never
}

export type AxiomConfig = BaseAxiomConfig & (EdgeAxiomConfig | EndpointAxiomConfig)

type ResolvedAxiomConfig = BaseAxiomConfig & {
  edgeUrl?: string
  baseUrl?: string
}

const AXIOM_FIELDS: ConfigField<ResolvedAxiomConfig>[] = [
  { key: 'dataset', env: ['NUXT_AXIOM_DATASET', 'AXIOM_DATASET'] },
  { key: 'apiKey', env: ['NUXT_AXIOM_API_KEY', 'AXIOM_API_KEY'] },
  // Deprecated env var names — resolved as a fallback for `apiKey` below.
  { key: 'token', env: ['NUXT_AXIOM_TOKEN', 'AXIOM_TOKEN'] },
  { key: 'orgId', env: ['NUXT_AXIOM_ORG_ID', 'AXIOM_ORG_ID'] },
  { key: 'edgeUrl', env: ['NUXT_AXIOM_EDGE_URL', 'AXIOM_EDGE_URL'] },
  { key: 'baseUrl', env: ['NUXT_AXIOM_URL', 'AXIOM_URL'] },
  { key: 'timeout' },
  { key: 'retries' },
]

let warnedAboutToken = false

function applyApiKeyAlias(config: ResolvedAxiomConfig): ResolvedAxiomConfig {
  if (!config.apiKey && config.token) {
    if (!warnedAboutToken) {
      warnedAboutToken = true
      console.warn('[evlog/axiom] `token` is deprecated, use `apiKey` instead. (Env: NUXT_AXIOM_TOKEN/AXIOM_TOKEN → NUXT_AXIOM_API_KEY/AXIOM_API_KEY.)')
    }
    config.apiKey = config.token
  }
  return config
}

/**
 * Create a drain function for sending logs to Axiom.
 *
 * Configuration priority (highest to lowest):
 * 1. Overrides passed to createAxiomDrain()
 * 2. runtimeConfig.evlog.axiom
 * 3. runtimeConfig.axiom
 * 4. Environment variables: NUXT_AXIOM_API_KEY, AXIOM_API_KEY (or legacy `*_TOKEN`)
 *
 * @example
 * ```ts
 * // Zero config — set NUXT_AXIOM_API_KEY and NUXT_AXIOM_DATASET
 * initLogger({ drain: createAxiomDrain() })
 *
 * // With overrides
 * initLogger({ drain: createAxiomDrain({ dataset: 'my-dataset' }) })
 * ```
 */
export function createAxiomDrain(overrides?: Partial<AxiomConfig>) {
  return defineHttpDrain<AxiomConfig>({
    name: 'axiom',
    resolve: async () => {
      const resolved = await resolveAdapterConfig<ResolvedAxiomConfig>(
        'axiom',
        AXIOM_FIELDS,
        overrides as Partial<ResolvedAxiomConfig>,
      )
      const config = applyApiKeyAlias(resolved)
      if (!config.dataset || !config.apiKey) {
        console.error('[evlog/axiom] Missing dataset or apiKey. Set NUXT_AXIOM_API_KEY/NUXT_AXIOM_DATASET env vars or pass to createAxiomDrain()')
        return null
      }
      if (config.edgeUrl && config.baseUrl) {
        console.warn('[evlog/axiom] Both edgeUrl and baseUrl are set. edgeUrl takes precedence for ingest.')
        delete config.baseUrl
      }
      return config as AxiomConfig
    },
    encode: (events, config) => {
      const url = resolveIngestUrl(config)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      if (config.orgId) headers['X-Axiom-Org-Id'] = config.orgId
      return { url, headers, body: JSON.stringify(events) }
    },
  })
}

/**
 * Send a single event to Axiom.
 */
export async function sendToAxiom(event: WideEvent, config: AxiomConfig): Promise<void> {
  await sendBatchToAxiom([event], config)
}

/**
 * Send a batch of events to Axiom.
 */
export async function sendBatchToAxiom(events: WideEvent[], config: AxiomConfig): Promise<void> {
  const apiKey = config.apiKey ?? config.token
  if (!apiKey) {
    throw new Error('[evlog/axiom] Missing apiKey')
  }
  const url = resolveIngestUrl(config)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
  if (config.orgId) headers['X-Axiom-Org-Id'] = config.orgId
  await httpPost({
    url,
    headers,
    body: JSON.stringify(events),
    timeout: config.timeout ?? 5000,
    retries: config.retries,
    label: 'Axiom',
  })
}

function resolveIngestUrl(config: AxiomConfig): string {
  const encodedDataset = encodeURIComponent(config.dataset)

  if (!config.edgeUrl) {
    const baseUrl = config.baseUrl ?? 'https://api.axiom.co'
    return `${baseUrl}/v1/datasets/${encodedDataset}/ingest`
  }

  try {
    const parsed = new URL(config.edgeUrl)
    if (parsed.pathname === '' || parsed.pathname === '/') {
      parsed.pathname = `/v1/ingest/${encodedDataset}`
      return parsed.toString()
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    return parsed.toString()
  } catch {
    console.warn(`[evlog/axiom] edgeUrl "${config.edgeUrl}" is not a valid URL, falling back to string concatenation.`)
    const trimmed = config.edgeUrl.replace(/\/+$/, '')
    return `${trimmed}/v1/ingest/${encodedDataset}`
  }
}
