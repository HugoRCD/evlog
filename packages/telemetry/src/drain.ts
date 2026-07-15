import type { RunEvent } from './types'

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

/** HTTP ingestion drain with timeout. Returns true when delivery succeeds. */
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
      return res.ok
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
