import type { WideEvent } from '../types'
import type { ConfigField } from './_config'
import { resolveAdapterConfig } from './_config'
import { defineDrain } from './_drain'
import { httpPost } from './_http'

export interface AxiomConfig {
  /** Axiom dataset name */
  dataset: string
  /** Axiom API token */
  token: string
  /** Organization ID (required for Personal Access Tokens) */
  orgId?: string
  /** Base URL for Axiom API. Default: https://api.axiom.co */
  baseUrl?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
}

const AXIOM_FIELDS: ConfigField<AxiomConfig>[] = [
  { key: 'dataset', env: ['NUXT_AXIOM_DATASET', 'AXIOM_DATASET'] },
  { key: 'token', env: ['NUXT_AXIOM_TOKEN', 'AXIOM_TOKEN'] },
  { key: 'orgId', env: ['NUXT_AXIOM_ORG_ID', 'AXIOM_ORG_ID'] },
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
      const config = resolveAdapterConfig<AxiomConfig>('axiom', AXIOM_FIELDS, overrides)
      if (!config.dataset || !config.token) {
        console.error('[evlog/axiom] Missing dataset or token. Set NUXT_AXIOM_TOKEN/NUXT_AXIOM_DATASET env vars or pass to createAxiomDrain()')
        return null
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
  const baseUrl = config.baseUrl ?? 'https://api.axiom.co'
  const url = `${baseUrl}/v1/datasets/${encodeURIComponent(config.dataset)}/ingest`

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
