import type { RunEvent } from './types'

/**
 * Drain function that attempts delivery for buffered run events.
 * @returns `true` when the batch should be removed from the outbox — either
 * because it was delivered, or because the server permanently rejected it
 * and retrying would never succeed. `false` keeps the batch buffered for a
 * later, transient-failure retry (network error, timeout, 5xx, 429).
 */
export type TelemetryDrain = (events: RunEvent[]) => Promise<boolean>

/** Resolve endpoint: env override → baked-in option → undefined (outbox-only). */
export function resolveEndpoint(option?: string): string | undefined {
  return process.env.EVLOG_TELEMETRY_ENDPOINT ?? option
}

/** No-op drain — outbox-only mode. */
export function createNoopDrain(): TelemetryDrain {
  return () => Promise.resolve(false)
}

/** Print would-be payloads to stderr when `EVLOG_TELEMETRY_DEBUG=1`. */
export function createDebugDrain(): TelemetryDrain {
  return (events) => {
    if (process.env.EVLOG_TELEMETRY_DEBUG !== '1') return Promise.resolve(false)
    for (const event of events) {
      process.stderr.write(`[@evlog/telemetry] ${JSON.stringify(event)}\n`)
    }
    return Promise.resolve(false)
  }
}

/** HTTP ingestion drain with timeout. Returns true when the outbox should drop the batch. */
export function createHttpDrain(endpoint: string, timeoutMs = 400): TelemetryDrain {
  return async (events) => {
    if (events.length === 0) return true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events }),
        signal: controller.signal,
      })
      if (res.ok) return true
      // A 4xx (excluding 429, which is transient rate limiting) means the
      // server permanently rejected this exact payload — an oversized batch,
      // a schema it doesn't recognise, etc. Retrying identical bytes will
      // never succeed, and leaving them in the outbox would silently poison
      // it forever: every future run re-sends the same broken batch first,
      // blocking all telemetry for this tool indefinitely. Drop it instead —
      // losing one batch beats losing all of them.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return true
      return false
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }
}

/** Compose drains — debug runs first; HTTP result wins for delivery tracking. */
export function composeDrains(...drains: TelemetryDrain[]): TelemetryDrain {
  return async (events) => {
    let delivered = false
    for (const drain of drains) {
      const ok = await drain(events)
      if (ok) delivered = true
    }
    return delivered
  }
}
