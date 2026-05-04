# Adapter Source Template

Complete TypeScript template for `packages/evlog/src/adapters/{name}.ts` using the public toolkit primitives `defineHttpDrain` + `resolveAdapterConfig`.

Replace `{Name}`, `{name}`, and `{NAME}` with the actual service name.

```typescript
import type { WideEvent } from '../types'
import type { ConfigField } from '../shared/config'
import { resolveAdapterConfig } from '../shared/config'
import { defineHttpDrain } from '../shared/drain'

// --- 1. Config Interface -------------------------------------------------
// Service-specific fields. Standard names: apiKey, endpoint, serviceName, timeout.

export interface {Name}Config {
  /** {Name} API key */
  apiKey: string
  /** {Name} API endpoint. Default: https://api.{name}.com */
  endpoint?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
  // Add service-specific fields here (dataset, project, region, etc.)
}

// Field manifest — drives both resolveAdapterConfig and runtime-config-aware
// drain initialization.
const FIELDS: ConfigField<{Name}Config>[] = [
  { key: 'apiKey', env: ['NUXT_{NAME}_API_KEY', '{NAME}_API_KEY'] },
  { key: 'endpoint', env: ['NUXT_{NAME}_ENDPOINT', '{NAME}_ENDPOINT'] },
  { key: 'timeout' },
]

// --- 2. Event Transformation (optional) ----------------------------------
// If the service needs a specific shape, expose a converter so it's testable
// independently. Otherwise pass `events` straight through in `encode`.

export interface {Name}Event {
  timestamp: string
  level: string
  data: Record<string, unknown>
}

/** Convert a WideEvent to {Name}'s event format. */
export function to{Name}Event(event: WideEvent): {Name}Event {
  const { timestamp, level, ...rest } = event
  return { timestamp, level, data: rest }
}

// --- 3. Encode helper (pure, easy to test) -------------------------------
function build{Name}Payload(events: WideEvent[], config: {Name}Config) {
  const endpoint = (config.endpoint ?? 'https://api.{name}.com').replace(/\/$/, '')
  return {
    url: `${endpoint}/v1/ingest`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(events.map(to{Name}Event)),
  }
}

// --- 4. Direct send helpers ----------------------------------------------
// Exported for direct use and testability.

/** Send a single event to {Name}. */
export async function sendTo{Name}(event: WideEvent, config: {Name}Config): Promise<void> {
  await sendBatchTo{Name}([event], config)
}

/** Send a batch of events to {Name}. */
export async function sendBatchTo{Name}(
  events: WideEvent[],
  config: {Name}Config,
): Promise<void> {
  if (events.length === 0) return

  const { url, headers, body } = build{Name}Payload(events, config)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.timeout ?? 5000)

  try {
    const response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal })
    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      const safe = text.length > 200 ? `${text.slice(0, 200)}...[truncated]` : text
      throw new Error(`{Name} API error: ${response.status} ${response.statusText} - ${safe}`)
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

// --- 5. Factory built on `defineHttpDrain` ------------------------------
/**
 * Create a drain function for sending logs to {Name}.
 *
 * Configuration priority (highest to lowest):
 * 1. Overrides passed to create{Name}Drain()
 * 2. runtimeConfig.evlog.{name}
 * 3. runtimeConfig.{name}
 * 4. Environment variables: NUXT_{NAME}_*, {NAME}_*
 *
 * @example
 * ```ts
 * import { create{Name}Drain } from 'evlog/{name}'
 *
 * // Zero config — set NUXT_{NAME}_API_KEY env var
 * defineEvlog({ drain: create{Name}Drain() })
 *
 * // With overrides
 * defineEvlog({ drain: create{Name}Drain({ apiKey: 'my-key' }) })
 * ```
 */
export function create{Name}Drain(overrides?: Partial<{Name}Config>) {
  return defineHttpDrain<{Name}Config>({
    name: '{name}',
    timeout: overrides?.timeout,
    resolve: async () => {
      const config = await resolveAdapterConfig<{Name}Config>('{name}', FIELDS, overrides)
      if (!config.apiKey) {
        console.error('[evlog/{name}] Missing apiKey. Set NUXT_{NAME}_API_KEY env var or pass to create{Name}Drain()')
        return null
      }
      return config as {Name}Config
    },
    encode: (events, config) => build{Name}Payload(events, config),
  })
}
```

## Customization Notes

- **Auth style**: Some services use `Authorization: Bearer`, others use a custom header like `X-API-Key`. Adjust `headers` in `build{Name}Payload`.
- **Payload format**: Some services accept raw JSON arrays (Axiom), others need a wrapper object (PostHog `{ api_key, batch }`), others need a protocol-specific structure (OTLP). Adapt `build{Name}Payload`.
- **Event transformation**: If the service expects a specific schema, implement `to{Name}Event()`. If it accepts arbitrary JSON, send `events` directly.
- **Custom transport**: If the service truly cannot fit `defineHttpDrain` (e.g. binary envelopes, gRPC), fall back to `defineDrain` from `../shared/drain` and call `httpPost` (from `../shared/http`) explicitly.
- **Deprecated aliases**: When renaming a config field (e.g. `token` → `apiKey`), keep both as `ConfigField` entries and fall through in `resolve()`. See `axiom.ts` and `better-stack.ts` for the pattern.
