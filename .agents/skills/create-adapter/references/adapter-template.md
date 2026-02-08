# Adapter Source Template

Complete TypeScript template for `packages/evlog/src/adapters/{name}.ts`.

Replace `{Name}`, `{name}`, and `{NAME}` with the actual service name.

```typescript
import type { DrainContext, WideEvent } from '../types'
import { getRuntimeConfig } from './_utils'

// --- 1. Config Interface ---
// Define all service-specific configuration fields.
// Always include optional `timeout`.
export interface {Name}Config {
  /** {Name} API key / token */
  apiKey: string
  /** {Name} API endpoint. Default: https://api.{name}.com */
  endpoint?: string
  /** Request timeout in milliseconds. Default: 5000 */
  timeout?: number
  // Add service-specific fields here (dataset, project, region, etc.)
}

// --- 2. Event Transformation (optional) ---
// Export a converter if the service needs a specific format.
// This makes the transformation testable independently.

/** {Name} event structure */
export interface {Name}Event {
  // Define the target service's event shape
  timestamp: string
  level: string
  data: Record<string, unknown>
}

/**
 * Convert a WideEvent to {Name}'s event format.
 */
export function to{Name}Event(event: WideEvent): {Name}Event {
  const { timestamp, level, ...rest } = event

  return {
    timestamp,
    level,
    data: rest,
  }
}

// --- 3. Factory Function ---
// Returns a drain function that resolves config at call time.
// Config priority: overrides > runtimeConfig.evlog.{name} > runtimeConfig.{name} > env vars

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
 * // Zero config - set NUXT_{NAME}_API_KEY env var
 * nitroApp.hooks.hook('evlog:drain', create{Name}Drain())
 *
 * // With overrides
 * nitroApp.hooks.hook('evlog:drain', create{Name}Drain({
 *   apiKey: 'my-key',
 * }))
 * ```
 */
export function create{Name}Drain(overrides?: Partial<{Name}Config>): (ctx: DrainContext) => Promise<void> {
  return async (ctx: DrainContext) => {
    const runtimeConfig = getRuntimeConfig()
    const evlogConfig = runtimeConfig?.evlog?.{name}
    const rootConfig = runtimeConfig?.{name}

    // Build config with fallbacks
    const config: Partial<{Name}Config> = {
      apiKey: overrides?.apiKey ?? evlogConfig?.apiKey ?? rootConfig?.apiKey
        ?? process.env.NUXT_{NAME}_API_KEY ?? process.env.{NAME}_API_KEY,
      endpoint: overrides?.endpoint ?? evlogConfig?.endpoint ?? rootConfig?.endpoint
        ?? process.env.NUXT_{NAME}_ENDPOINT ?? process.env.{NAME}_ENDPOINT,
      timeout: overrides?.timeout ?? evlogConfig?.timeout ?? rootConfig?.timeout,
    }

    // Validate required fields
    if (!config.apiKey) {
      console.error('[evlog/{name}] Missing apiKey. Set NUXT_{NAME}_API_KEY env var or pass to create{Name}Drain()')
      return
    }

    try {
      await sendTo{Name}(ctx.event, config as {Name}Config)
    } catch (error) {
      console.error('[evlog/{name}] Failed to send event:', error)
    }
  }
}

// --- 5. Send Functions ---
// Exported for direct use and testability.
// sendTo{Name} wraps sendBatchTo{Name} for single events.

/**
 * Send a single event to {Name}.
 */
export async function sendTo{Name}(event: WideEvent, config: {Name}Config): Promise<void> {
  await sendBatchTo{Name}([event], config)
}

/**
 * Send a batch of events to {Name}.
 */
export async function sendBatchTo{Name}(events: WideEvent[], config: {Name}Config): Promise<void> {
  if (events.length === 0) return

  const endpoint = (config.endpoint ?? 'https://api.{name}.com').replace(/\/$/, '')
  const timeout = config.timeout ?? 5000
  // Construct the full URL for the service's ingest API
  const url = `${endpoint}/v1/ingest`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    // Add service-specific headers here
  }

  // Transform events if the service needs a specific format
  const payload = events.map(to{Name}Event)
  // Or send raw: JSON.stringify(events)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error')
      const safeText = text.length > 200 ? `${text.slice(0, 200)}...[truncated]` : text
      throw new Error(`{Name} API error: ${response.status} ${response.statusText} - ${safeText}`)
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
```

## Customization Notes

- **Auth style**: Some services use `Authorization: Bearer`, others use a custom header like `X-API-Key`. Adjust the headers accordingly.
- **Payload format**: Some services accept raw JSON arrays (Axiom), others need a wrapper object (PostHog `{ api_key, batch }`), others need a protocol-specific structure (OTLP). Adapt `sendBatchTo{Name}` to match.
- **Event transformation**: If the service expects a specific schema, implement `to{Name}Event()`. If the service accepts arbitrary JSON, you can skip it and send `ctx.event` directly.
- **URL construction**: Match the service's API endpoint pattern. Some use path-based routing (`/v1/datasets/{id}/ingest`), others use a flat endpoint (`/batch/`).
- **Extra config fields**: Add service-specific fields to the config interface (e.g., `dataset` for Axiom, `orgId` for org-scoped APIs, `host` for region selection).
