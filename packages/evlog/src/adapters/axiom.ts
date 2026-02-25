import type { WideEvent } from '../types'
import type { ConfigField } from './_config'
import { resolveAdapterConfig } from './_config'
import { defineDrain } from './_drain'
import { httpPost } from './_http'

interface BaseAxiomConfig {
  /** Axiom dataset name */
  dataset: string
  /** Axiom API token */
  token: string
  /** Organization ID (required for Personal Access Tokens) */
  orgId?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
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
  { key: 'token', env: ['NUXT_AXIOM_TOKEN', 'AXIOM_TOKEN'] },
  { key: 'orgId', env: ['NUXT_AXIOM_ORG_ID', 'AXIOM_ORG_ID'] },
  { key: 'edgeUrl', env: ['NUXT_AXIOM_EDGE_URL', 'AXIOM_EDGE_URL'] },
  { key: 'baseUrl', env: ['NUXT_AXIOM_URL', 'AXIOM_URL'] },
  { key: 'timeout' },
]

/**
 * Create a drain function for sending logs to Axiom.
 *
 * Configuration priority (highest to lowest):
 * 1. Overrides passed to createAxiomDrain()
 * 2. runtimeConfig.evlog.axiom
 * 3. runtimeConfig.axiom
 * 4. Environment variables: NUXT_AXIOM_*, AXIOM_*
 *
 * @example
 * ```ts
 * // Zero config - just set NUXT_AXIOM_TOKEN and NUXT_AXIOM_DATASET env vars
 * nitroApp.hooks.hook('evlog:drain', createAxiomDrain())
 *
 * // With overrides
 * nitroApp.hooks.hook('evlog:drain', createAxiomDrain({
 *   dataset: 'my-dataset',
 * }))
 * ```
 */
export function createAxiomDrain(overrides?: Partial<AxiomConfig>) {
  return defineDrain<AxiomConfig>({
    name: 'axiom',
    resolve: () => {
      const config = resolveAdapterConfig<ResolvedAxiomConfig>(
        'axiom',
        AXIOM_FIELDS,
        overrides as Partial<ResolvedAxiomConfig>,
      )
      if (!config.dataset || !config.token) {
        console.error('[evlog/axiom] Missing dataset or token. Set NUXT_AXIOM_TOKEN/NUXT_AXIOM_DATASET env vars or pass to createAxiomDrain()')
        return null
      }

      if (config.edgeUrl && config.baseUrl) {
        console.warn('[evlog/axiom] Both edgeUrl and baseUrl are set. edgeUrl takes precedence for ingest.')
        delete config.baseUrl
      }

      return config as AxiomConfig
    },
    send: sendBatchToAxiom,
  })
}

/**
 * Send a single event to Axiom.
 *
 * @example
 * ```ts
 * await sendToAxiom(event, {
 *   dataset: 'my-logs',
 *   token: process.env.AXIOM_TOKEN!,
 * })
 * ```
 */
export async function sendToAxiom(event: WideEvent, config: AxiomConfig): Promise<void> {
  await sendBatchToAxiom([event], config)
}

/**
 * Send a batch of events to Axiom.
 *
 * @example
 * ```ts
 * await sendBatchToAxiom(events, {
 *   dataset: 'my-logs',
 *   token: process.env.AXIOM_TOKEN!,
 * })
 * ```
 */
export async function sendBatchToAxiom(events: WideEvent[], config: AxiomConfig): Promise<void> {
  const url = resolveIngestUrl(config)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.token}`,
  }

  if (config.orgId) {
    headers['X-Axiom-Org-Id'] = config.orgId
  }

  await httpPost({
    url,
    headers,
    body: JSON.stringify(events),
    timeout: config.timeout ?? 5000,
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
