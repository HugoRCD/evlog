import type { WideEvent } from '../types'
import type { ConfigField } from '../shared/config'
import { resolveAdapterConfig } from '../shared/config'
import { defineHttpDrain } from '../shared/drain'
import { httpPost } from '../shared/http'

export interface DatadogConfig {
  /** Datadog API key with Logs intake permission */
  apiKey: string
  /**
   * Datadog site hostname (e.g. `datadoghq.com`, `datadoghq.eu`, `us3.datadoghq.com`, `ddog-gov.com`).
   * Ignored when `intakeUrl` is set. Default: `datadoghq.com`
   */
  site?: string
  /**
   * Full Logs HTTP intake URL. When set, overrides the URL derived from `site`.
   * Default: `https://http-intake.logs.${site}/api/v2/logs`
   */
  intakeUrl?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
  /** Number of retry attempts on transient failures. Default: 2 */
  retries?: number
}

const DATADOG_FIELDS: ConfigField<DatadogConfig>[] = [
  { key: 'apiKey', env: ['NUXT_DATADOG_API_KEY', 'DATADOG_API_KEY', 'DD_API_KEY'] },
  { key: 'site', env: ['NUXT_DATADOG_SITE', 'DATADOG_SITE', 'DD_SITE'] },
  { key: 'intakeUrl', env: ['NUXT_DATADOG_LOGS_URL', 'DATADOG_LOGS_URL'] },
  { key: 'timeout' },
  { key: 'retries' },
]

const DEFAULT_SITE = 'datadoghq.com'

/**
 * Datadog treats **`status`** as log severity. evlog uses **`status`** for HTTP response codes on the wide event and
 * inside **`error`** (structured errors). Rename every **numeric** `status` at any depth to **`httpStatusCode`** so
 * nothing in the payload collides with reserved severity when Datadog processes attributes.
 *
 * Does not mutate the original {@link WideEvent} (builds new objects).
 */
export function sanitizeWideEventForDatadog(event: WideEvent): Record<string, unknown> {
  return deepRenameNumericHttpStatus(event as Record<string, unknown>) as Record<string, unknown>
}

function deepRenameNumericHttpStatus(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(deepRenameNumericHttpStatus)
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'status' && typeof v === 'number') {
      out.httpStatusCode = v
    } else {
      out[k] = deepRenameNumericHttpStatus(v)
    }
  }
  return out
}

/**
 * Single-line summary for Datadog’s `message` column (Live Tail / Explorer list view).
 * Full context stays under {@link toDatadogLog}'s `evlog` object.
 */
export function formatDatadogMessageLine(event: WideEvent): string {
  const levelU = event.level.toUpperCase()
  const method = typeof event.method === 'string' ? event.method : ''
  const path = typeof event.path === 'string' ? event.path : ''
  const code = typeof event.status === 'number' ? event.status : undefined

  const head = [levelU, method, path].filter(p => p.length > 0).join(' ')
  let line = code !== undefined
    ? (head ? `${head} (${code})` : `${levelU} (${code})`)
    : (head || levelU)

  if (!method && !path && line === levelU && event.service) {
    line = `${levelU} ${event.service}`
  }
  return line
}

/**
 * Severity for Datadog’s reserved `status` field (drives Live Tail coloring and facets).
 *
 * Uses the wide event’s **`level`** first (`log.error()` / `log.warn()`). If the level is
 * still `info`, falls back to the HTTP **`status`** on the wide event (`status: 4xx` → `warn`,
 * `5xx` → `error`) so client/server error responses are visible even when no `log.error()`
 * ran. Purely business errors on **HTTP 200** only change Datadog if you call `log.error()`.
 */
export function resolveDatadogLogStatus(event: WideEvent): 'error' | 'warn' | 'info' | 'debug' {
  if (event.level === 'error') return 'error'
  if (event.level === 'warn') return 'warn'
  if (event.level === 'debug') return 'debug'
  const code = typeof event.status === 'number' ? event.status : undefined
  if (code !== undefined && code >= 500) return 'error'
  if (code !== undefined && code >= 400) return 'warn'
  return 'info'
}

/**
 * Map an evlog wide event to a [Datadog Logs API v2](https://docs.datadoghq.com/api/latest/logs/) log object.
 *
 * Shape:
 * - **`message`** — short line for the list view (`formatDatadogMessageLine`)
 * - **`evlog`** — full sanitized wide event (HTTP codes as `httpStatusCode`); use facets like `@evlog.path`
 * - **`status`**, **`service`**, **`ddsource`**, **`ddtags`**, **`timestamp`** — Datadog standard fields
 */
export function toDatadogLog(event: WideEvent): Record<string, unknown> {
  const ms = Date.parse(event.timestamp)
  const tags = [`env:${event.environment}`]
  const versionTag = event.version
  if (versionTag !== undefined && versionTag !== null && versionTag !== '') {
    tags.push(`version:${String(versionTag)}`)
  }

  return {
    message: formatDatadogMessageLine(event),
    evlog: sanitizeWideEventForDatadog(event),
    service: event.service,
    status: resolveDatadogLogStatus(event),
    ddsource: 'evlog',
    ddtags: tags.join(','),
    ...(Number.isFinite(ms) ? { timestamp: ms } : {}),
  }
}

/**
 * Resolve the Logs intake URL from configuration.
 */
export function resolveDatadogIntakeUrl(config: Pick<DatadogConfig, 'site' | 'intakeUrl'>): string {
  if (config.intakeUrl) {
    return config.intakeUrl.replace(/\/+$/, '')
  }
  const site = (config.site ?? DEFAULT_SITE).replace(/^\./, '').replace(/\/+$/, '')
  return `https://http-intake.logs.${site}/api/v2/logs`
}

/**
 * Create a drain function for sending logs to Datadog via the HTTP Logs intake API.
 *
 * Configuration priority (highest to lowest):
 * 1. Overrides passed to `createDatadogDrain()`
 * 2. `runtimeConfig.evlog.datadog`
 * 3. `runtimeConfig.datadog`
 * 4. Environment variables: `NUXT_DATADOG_*`, `DATADOG_*`, and common `DD_*` aliases
 *
 * @example
 * ```ts
 * // Zero config — set DD_API_KEY (or NUXT_DATADOG_API_KEY) and optionally DD_SITE
 * nitroApp.hooks.hook('evlog:drain', createDatadogDrain())
 *
 * nitroApp.hooks.hook('evlog:drain', createDatadogDrain({
 *   site: 'datadoghq.eu',
 * }))
 * ```
 */
export function createDatadogDrain(overrides?: Partial<DatadogConfig>) {
  return defineHttpDrain<DatadogConfig>({
    name: 'datadog',
    resolve: async () => {
      const config = await resolveAdapterConfig<DatadogConfig>('datadog', DATADOG_FIELDS, overrides)
      if (!config.apiKey) {
        console.error('[evlog/datadog] Missing API key. Set NUXT_DATADOG_API_KEY, DATADOG_API_KEY, or DD_API_KEY, or pass apiKey to createDatadogDrain()')
        return null
      }
      return config as DatadogConfig
    },
    encode: (events, config) => ({
      url: resolveDatadogIntakeUrl(config),
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': config.apiKey,
      },
      body: JSON.stringify(events.map(toDatadogLog)),
    }),
  })
}

/**
 * Send a single wide event to Datadog.
 */
export async function sendToDatadog(event: WideEvent, config: DatadogConfig): Promise<void> {
  await sendBatchToDatadog([event], config)
}

/**
 * Send a batch of wide events to Datadog in one request.
 */
export async function sendBatchToDatadog(events: WideEvent[], config: DatadogConfig): Promise<void> {
  if (events.length === 0) return

  const url = resolveDatadogIntakeUrl(config)

  await httpPost({
    url,
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': config.apiKey,
    },
    body: JSON.stringify(events.map(toDatadogLog)),
    timeout: config.timeout ?? 5000,
    retries: config.retries,
    label: 'Datadog',
  })
}
