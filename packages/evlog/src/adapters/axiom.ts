import type { DrainContext, WideEvent } from '../types'
import { getRuntimeConfig } from './_utils'

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
export function createAxiomDrain(overrides?: Partial<AxiomConfig>): (ctx: DrainContext | DrainContext[]) => Promise<void> {
  return async (ctx: DrainContext | DrainContext[]) => {
    const contexts = Array.isArray(ctx) ? ctx : [ctx]
    if (contexts.length === 0) return

    const runtimeConfig = getRuntimeConfig()
    // Support both runtimeConfig.evlog.axiom and runtimeConfig.axiom
    const evlogAxiom = runtimeConfig?.evlog?.axiom
    const rootAxiom = runtimeConfig?.axiom

    // Build config with fallbacks: overrides > evlog.axiom > axiom > env vars (NUXT_AXIOM_* or AXIOM_*)
    const config: Partial<AxiomConfig> = {
      dataset: overrides?.dataset ?? evlogAxiom?.dataset ?? rootAxiom?.dataset ?? process.env.NUXT_AXIOM_DATASET ?? process.env.AXIOM_DATASET,
      token: overrides?.token ?? evlogAxiom?.token ?? rootAxiom?.token ?? process.env.NUXT_AXIOM_TOKEN ?? process.env.AXIOM_TOKEN,
      orgId: overrides?.orgId ?? evlogAxiom?.orgId ?? rootAxiom?.orgId ?? process.env.NUXT_AXIOM_ORG_ID ?? process.env.AXIOM_ORG_ID,
      baseUrl: overrides?.baseUrl ?? evlogAxiom?.baseUrl ?? rootAxiom?.baseUrl ?? process.env.NUXT_AXIOM_URL ?? process.env.AXIOM_URL,
      timeout: overrides?.timeout ?? evlogAxiom?.timeout ?? rootAxiom?.timeout,
    }

    if (!config.dataset || !config.token) {
      console.error('[evlog/axiom] Missing dataset or token. Set NUXT_AXIOM_TOKEN/NUXT_AXIOM_DATASET env vars or pass to createAxiomDrain()')
      return
    }

    await sendBatchToAxiom(contexts.map(c => c.event), config as AxiomConfig)
  }
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
  const timeout = config.timeout ?? 5000
  const url = `${baseUrl}/v1/datasets/${encodeURIComponent(config.dataset)}/ingest`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.token}`,
  }

  if (config.orgId) {
    headers['X-Axiom-Org-Id'] = config.orgId
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(events),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      const safeText = text.length > 200 ? `${text.slice(0, 200)}...[truncated]` : text
      throw new Error(`Axiom API error: ${response.status} ${response.statusText} - ${safeText}`)
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
