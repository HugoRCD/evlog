/**
 * Community adapter skeleton — reference implementation.
 *
 * Replace `Acme` / `acme` / `ACME` with your service name and ship the package
 * as `evlog-acme` (or similar). The shape mirrors every built-in adapter, so
 * users get the same configuration UX as `evlog/axiom`, `evlog/datadog`, etc.
 */
import type { WideEvent } from 'evlog'
import {
  defineHttpDrain,
  resolveAdapterConfig,
  type ConfigField,
} from 'evlog/toolkit'

export interface AcmeConfig {
  /** Acme API key. */
  apiKey: string
  /** Acme ingest endpoint. Default: https://api.acme.example.com */
  endpoint?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
}

const FIELDS: ConfigField<AcmeConfig>[] = [
  { key: 'apiKey', env: ['ACME_API_KEY', 'NUXT_ACME_API_KEY'] },
  { key: 'endpoint', env: ['ACME_ENDPOINT', 'NUXT_ACME_ENDPOINT'] },
  { key: 'timeout' },
]

export interface AcmeEvent {
  ts: number
  level: string
  attributes: Record<string, unknown>
}

/**
 * Convert a WideEvent into Acme's payload shape. Exposed publicly so consumers
 * can unit-test their assumptions without needing a network round-trip.
 */
export function toAcmeEvent(event: WideEvent): AcmeEvent {
  const { timestamp, level, ...rest } = event
  return {
    ts: new Date(timestamp).getTime(),
    level,
    attributes: rest,
  }
}

function buildAcmePayload(events: WideEvent[], config: AcmeConfig) {
  const endpoint = (config.endpoint ?? 'https://api.acme.example.com').replace(/\/$/, '')
  return {
    url: `${endpoint}/v1/ingest`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(events.map(toAcmeEvent)),
  }
}

/**
 * Create an Acme drain.
 *
 * Configuration priority (highest to lowest):
 * 1. `overrides` passed here
 * 2. `runtimeConfig.evlog.acme` (Nuxt/Nitro)
 * 3. `runtimeConfig.acme` (legacy Nuxt/Nitro)
 * 4. `NUXT_ACME_*` env vars
 * 5. `ACME_*` env vars
 *
 * @example
 * ```ts
 * import { defineEvlog } from 'evlog/toolkit'
 * import { createAcmeDrain } from 'evlog-acme'
 *
 * defineEvlog({ drain: createAcmeDrain() }) // zero-config via env
 * defineEvlog({ drain: createAcmeDrain({ apiKey: '...' }) })
 * ```
 */
export function createAcmeDrain(overrides?: Partial<AcmeConfig>) {
  return defineHttpDrain<AcmeConfig>({
    name: 'acme',
    timeout: overrides?.timeout,
    resolve: async () => {
      const config = await resolveAdapterConfig<AcmeConfig>('acme', FIELDS, overrides)
      if (!config.apiKey) {
        console.error('[evlog/acme] Missing apiKey. Set ACME_API_KEY env var or pass to createAcmeDrain()')
        return null
      }
      return config as AcmeConfig
    },
    encode: (events, config) => buildAcmePayload(events, config),
  })
}
