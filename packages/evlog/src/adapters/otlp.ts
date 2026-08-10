import type { WideEvent } from '../types'
import type { ConfigField } from '../shared/config'
import { formatPublicEnvKeys, resolveAdapterConfig } from '../shared/config'
import type { HttpDrainRequest } from '../shared/drain'
import { defineHttpDrain, sendEncodedDrainRequest } from '../shared/drain'
import { formatEventSummary, toOtlpAttributeValue } from '../shared/event'
import { OTEL_SEVERITY_NUMBER, OTEL_SEVERITY_TEXT } from '../shared/severity'

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
  /** Number of retry attempts on transient failures. Default: 2 */
  retries?: number
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
  { key: 'endpoint', env: ['NUXT_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTLP_ENDPOINT'] },
  { key: 'serviceName', env: ['NUXT_OTLP_SERVICE_NAME', 'OTEL_SERVICE_NAME'] },
  { key: 'headers' },
  { key: 'resourceAttributes' },
  { key: 'timeout' },
  { key: 'retries' },
]

// Re-exposed under a local name to keep call-sites tight while delegating to
// the shared OTLP attribute encoder in `evlog/toolkit`.
const toAttributeValue = toOtlpAttributeValue

/** Recursive flattening is limited to these; everything else is serialized whole. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Flatten nested plain objects into dotted attribute keys — `ai.costUsd`,
 * `error.message`. Arrays and non-plain objects are serialized as a single
 * value; indexing an array into `tools.0.name` would turn a list into
 * unbounded distinct attribute keys.
 */
function collectAttributes(
  value: Record<string, unknown>,
  prefix: string,
  out: OTLPLogRecord['attributes'],
): void {
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined || child === null) continue
    const path = prefix ? `${prefix}.${key}` : key
    // An empty object flattens to no attribute at all, which would drop the
    // field, so it is serialized like any other leaf.
    if (isPlainObject(child) && Object.keys(child).length > 0) {
      collectAttributes(child, path, out)
      continue
    }
    out.push({ key: path, value: toAttributeValue(child) })
  }
}

/**
 * Convert an evlog WideEvent to an OTLP LogRecord.
 *
 * Every field of the event becomes an attribute; the body is a one-line
 * summary. Serializing the whole event into the body as well would double what
 * the backend stores — and backends bill by volume, cluster bodies into
 * message templates, and scrub PII per attribute.
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
  collectAttributes(rest, '', attributes)

  const record: OTLPLogRecord = {
    timeUnixNano: String(timestamp),
    severityNumber: OTEL_SEVERITY_NUMBER[level] ?? 9,
    severityText: OTEL_SEVERITY_TEXT[level] ?? 'INFO',
    body: { stringValue: formatEventSummary(event) || event.service },
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
 * Kept inline as OTLP-specific (parses OTEL_EXPORTER_OTLP_HEADERS / OTLP_HEADERS as key=val,key=val).
 */
function getHeadersFromEnv(): Record<string, string> | undefined {
  const headersEnv = process.env.OTEL_EXPORTER_OTLP_HEADERS || process.env.OTLP_HEADERS || process.env.NUXT_OTLP_HEADERS
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
 * 2. runtimeConfig.evlog.otlp
 * 3. runtimeConfig.otlp
 * 4. Environment variables: OTEL_EXPORTER_OTLP_ENDPOINT (or OTLP_ENDPOINT), OTEL_SERVICE_NAME
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
  return defineHttpDrain<OTLPConfig>({
    name: 'otlp',
    resolve: async () => {
      const config = await resolveAdapterConfig<OTLPConfig>('otlp', OTLP_FIELDS, overrides)

      // OTLP-specific: resolve headers from env if not provided via config
      if (!config.headers) {
        config.headers = getHeadersFromEnv()
      }

      if (!config.endpoint) {
        console.error(`[evlog/otlp] Missing endpoint. Set ${formatPublicEnvKeys(['NUXT_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTLP_ENDPOINT'])} env var, or pass to createOTLPDrain()`)
        return null
      }
      return config as OTLPConfig
    },
    label: 'OTLP',
    encode: (events, config) => (events.length === 0 ? null : encodeOTLPRequest(events, config)),
  })
}

/**
 * Encode a batch of wide events into the OTLP/HTTP logs request. Shared by
 * {@link createOTLPDrain} and {@link sendBatchToOTLP}.
 */
function encodeOTLPRequest(events: WideEvent[], config: OTLPConfig): HttpDrainRequest {
  return {
    url: `${config.endpoint.replace(/\/$/, '')}/v1/logs`,
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify(buildOTLPPayload(events, config)),
  }
}

function buildOTLPPayload(events: WideEvent[], config: OTLPConfig): ExportLogsServiceRequest {
  const grouped = new Map<string, WideEvent[]>()
  for (const event of events) {
    const key = `${event.service}::${event.environment}`
    const group = grouped.get(key)
    if (group) group.push(event)
    else grouped.set(key, [event])
  }
  return {
    resourceLogs: Array.from(grouped.values()).map(groupEvents => ({
      resource: { attributes: buildResourceAttributes(groupEvents[0]!, config) },
      scopeLogs: [
        {
          scope: { name: 'evlog' },
          logRecords: groupEvents.map(toOTLPLogRecord),
        },
      ],
    })),
  }
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
  await sendEncodedDrainRequest(encodeOTLPRequest(events, config), {
    label: 'OTLP',
    source: 'otlp',
    timeout: config.timeout,
    retries: config.retries,
  })
}
