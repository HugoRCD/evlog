import type { WideEvent } from '../types'
import type { ConfigField } from './_config'
import { resolveAdapterConfig } from './_config'
import { defineDrain } from './_drain'
import { httpPost } from './_http'
import { OTEL_SEVERITY_NUMBER, OTEL_SEVERITY_TEXT } from './_severity'

export interface OTLPConfig {
  /** OTLP HTTP endpoint (e.g., http://localhost:4318) */
  endpoint: string
  /** Override service name (defaults to event.service) */
  serviceName?: string
  /** Additional resource attributes */
  resourceAttributes?: Record<string, string | number | boolean>
  /** Custom headers (e.g., for authentication) */
  headers?: Record<string, string>
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
}

/** OTLP Log Record structure */
export interface OTLPLogRecord {
  timeUnixNano: string
  severityNumber: number
  severityText: string
  body: { stringValue: string }
  attributes: Array<{
    key: string
    value: { stringValue?: string, intValue?: string, boolValue?: boolean }
  }>
  traceId?: string
  spanId?: string
}

/** OTLP Resource structure */
interface OTLPResource {
  attributes: Array<{
    key: string
    value: { stringValue?: string, intValue?: string, boolValue?: boolean }
  }>
}

/** OTLP Scope structure */
interface OTLPScope {
  name: string
  version?: string
}

/** OTLP ExportLogsServiceRequest structure */
interface ExportLogsServiceRequest {
  resourceLogs: Array<{
    resource: OTLPResource
    scopeLogs: Array<{
      scope: OTLPScope
      logRecords: OTLPLogRecord[]
    }>
  }>
}

const OTLP_FIELDS: ConfigField<OTLPConfig>[] = [
  { key: 'endpoint', env: ['NUXT_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_ENDPOINT'] },
  { key: 'serviceName', env: ['NUXT_OTLP_SERVICE_NAME', 'OTEL_SERVICE_NAME'] },
  { key: 'headers' },
  { key: 'resourceAttributes' },
  { key: 'timeout' },
]

/**
 * Convert a value to OTLP attribute value format.
 */
function toAttributeValue(value: unknown): { stringValue?: string, intValue?: string, boolValue?: boolean } {
  if (typeof value === 'boolean') {
    return { boolValue: value }
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return { intValue: String(value) }
  }
  if (typeof value === 'string') {
    return { stringValue: value }
  }
  // For complex types, serialize to JSON string
  return { stringValue: JSON.stringify(value) }
}

/**
 * Convert an evlog WideEvent to an OTLP LogRecord.
 */
export function toOTLPLogRecord(event: WideEvent): OTLPLogRecord {
  const timestamp = new Date(event.timestamp).getTime() * 1_000_000 // Convert to nanoseconds

  // Extract known fields, rest goes to attributes
  const { level, traceId, spanId, ...rest } = event
  // Remove base fields from rest (they're handled as resource attributes)
  delete (rest as Record<string, unknown>).timestamp
  delete (rest as Record<string, unknown>).service
  delete (rest as Record<string, unknown>).environment
  delete (rest as Record<string, unknown>).version
  delete (rest as Record<string, unknown>).commitHash
  delete (rest as Record<string, unknown>).region

  const attributes: OTLPLogRecord['attributes'] = []

  // Add all remaining event fields as attributes
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined && value !== null) {
      attributes.push({
        key,
        value: toAttributeValue(value),
      })
    }
  }

  const record: OTLPLogRecord = {
    timeUnixNano: String(timestamp),
    severityNumber: OTEL_SEVERITY_NUMBER[level] ?? 9,
    severityText: OTEL_SEVERITY_TEXT[level] ?? 'INFO',
    body: { stringValue: JSON.stringify(event) },
    attributes,
  }

  // Add trace context if present
  if (typeof traceId === 'string') {
    record.traceId = traceId
  }
  if (typeof spanId === 'string') {
    record.spanId = spanId
  }

  return record
}

/**
 * Build OTLP resource attributes from event and config.
 */
function buildResourceAttributes(
  event: WideEvent,
  config: OTLPConfig,
): OTLPResource['attributes'] {
  const attributes: OTLPResource['attributes'] = []

  // Service name
  attributes.push({
    key: 'service.name',
    value: { stringValue: config.serviceName ?? event.service },
  })

  // Environment
  if (event.environment) {
    attributes.push({
      key: 'deployment.environment',
      value: { stringValue: event.environment },
    })
  }

  // Version
  if (event.version) {
    attributes.push({
      key: 'service.version',
      value: { stringValue: event.version },
    })
  }

  // Region
  if (event.region) {
    attributes.push({
      key: 'cloud.region',
      value: { stringValue: event.region },
    })
  }

  // Commit hash
  if (event.commitHash) {
    attributes.push({
      key: 'vcs.commit.id',
      value: { stringValue: event.commitHash },
    })
  }

  // Custom resource attributes from config
  if (config.resourceAttributes) {
    for (const [key, value] of Object.entries(config.resourceAttributes)) {
      attributes.push({
        key,
        value: toAttributeValue(value),
      })
    }
  }

  return attributes
}

/**
 * Build headers from OTEL env vars.
 * Kept inline as OTLP-specific (parses OTEL_EXPORTER_OTLP_HEADERS=key=val,key=val).
 */
function getHeadersFromEnv(): Record<string, string> | undefined {
  const headersEnv = process.env.OTEL_EXPORTER_OTLP_HEADERS || process.env.NUXT_OTLP_HEADERS
  if (headersEnv) {
    const headers: Record<string, string> = {}
    const decoded = decodeURIComponent(headersEnv)
    for (const pair of decoded.split(',')) {
      const eqIndex = pair.indexOf('=')
      if (eqIndex > 0) {
        const key = pair.slice(0, eqIndex).trim()
        const value = pair.slice(eqIndex + 1).trim()
        if (key && value) {
          headers[key] = value
        }
      }
    }
    if (Object.keys(headers).length > 0) return headers
  }

  const auth = process.env.NUXT_OTLP_AUTH
  if (auth) {
    return { Authorization: auth }
  }

  return undefined
}

/**
 * Create a drain function for sending logs to an OTLP endpoint.
 *
 * Configuration priority (highest to lowest):
 * 1. Overrides passed to createOTLPDrain()
 * 2. runtimeConfig.evlog.otlp (NUXT_EVLOG_OTLP_*)
 * 3. runtimeConfig.otlp (NUXT_OTLP_*)
 * 4. Environment variables: OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SERVICE_NAME
 *
 * @example
 * ```ts
 * // Zero config - reads from runtimeConfig or env vars
 * nitroApp.hooks.hook('evlog:drain', createOTLPDrain())
 *
 * // With overrides
 * nitroApp.hooks.hook('evlog:drain', createOTLPDrain({
 *   endpoint: 'http://localhost:4318',
 * }))
 * ```
 */
export function createOTLPDrain(overrides?: Partial<OTLPConfig>) {
  return defineDrain<OTLPConfig>({
    name: 'otlp',
    resolve: () => {
      const config = resolveAdapterConfig<OTLPConfig>('otlp', OTLP_FIELDS, overrides)

      // OTLP-specific: resolve headers from env if not provided via config
      if (!config.headers) {
        config.headers = getHeadersFromEnv()
      }

      if (!config.endpoint) {
        console.error('[evlog/otlp] Missing endpoint. Set NUXT_OTLP_ENDPOINT or OTEL_EXPORTER_OTLP_ENDPOINT env var, or pass to createOTLPDrain()')
        return null
      }
      return config as OTLPConfig
    },
    send: sendBatchToOTLP,
  })
}

/**
 * Send a single event to an OTLP endpoint.
 *
 * @example
 * ```ts
 * await sendToOTLP(event, {
 *   endpoint: 'http://localhost:4318',
 * })
 * ```
 */
export async function sendToOTLP(event: WideEvent, config: OTLPConfig): Promise<void> {
  await sendBatchToOTLP([event], config)
}

/**
 * Send a batch of events to an OTLP endpoint.
 *
 * @example
 * ```ts
 * await sendBatchToOTLP(events, {
 *   endpoint: 'http://localhost:4318',
 * })
 * ```
 */
export async function sendBatchToOTLP(events: WideEvent[], config: OTLPConfig): Promise<void> {
  if (events.length === 0) return

  const url = `${config.endpoint.replace(/\/$/, '')}/v1/logs`

  // Group events by service for proper resource attribution
  // For simplicity, we use the first event's resource attributes
  const [firstEvent] = events
  const resourceAttributes = buildResourceAttributes(firstEvent, config)

  const logRecords = events.map(toOTLPLogRecord)

  const payload: ExportLogsServiceRequest = {
    resourceLogs: [
      {
        resource: { attributes: resourceAttributes },
        scopeLogs: [
          {
            scope: { name: 'evlog', version: '1.0.0' },
            logRecords,
          },
        ],
      },
    ],
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config.headers,
  }

  await httpPost({
    url,
    headers,
    body: JSON.stringify(payload),
    timeout: config.timeout ?? 5000,
    label: 'OTLP',
  })
}
