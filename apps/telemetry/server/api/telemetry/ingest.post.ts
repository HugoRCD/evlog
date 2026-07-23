import { IngestValidationError, parseIngestBody } from '@evlog/telemetry/ingest'

// Best-effort floor against noisy retries/bots — see server/utils/rate-limit.ts.
const rateLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 })

/**
 * `POST /api/telemetry/ingest` — public, unauthenticated by design.
 *
 * CLI telemetry endpoints are semi-public (like a browser analytics key):
 * the URL ships inside the published CLI, so anyone can read it. Defense
 * lives here, not in a secret — validate the payload shape, allowlist tool
 * names and custom keys, dedupe on `idempotencyKey`, and rate-limit.
 */
export default defineEventHandler(async (event) => {
  const log = useLogger(event)

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!rateLimiter.isAllowed(ip)) {
    log.set({ ingest: { outcome: 'rate_limited' } })
    setResponseStatus(event, 429)
    return { error: 'rate limited' }
  }

  const raw = await readRawBody(event, 'utf8')
  if (!raw) {
    log.set({ ingest: { outcome: 'empty_body' } })
    setResponseStatus(event, 400)
    return { error: 'empty body' }
  }

  let events
  try {
    events = parseIngestBody(raw, {
      allowedTools: parseAllowedTools(process.env.ANALYTICS_ALLOWED_TOOLS),
      allowedCustomKeys: parseAllowedCustomKeys(process.env.ANALYTICS_ALLOWED_CUSTOM_KEYS),
    })
  } catch (err) {
    log.set({ ingest: { outcome: 'invalid_payload' } })
    setResponseStatus(event, err instanceof IngestValidationError ? 400 : 500)
    return { error: 'invalid payload' }
  }

  log.set({
    ingest: {
      eventCount: events.length,
      tools: [...new Set(events.map(e => e.tool.name))],
      environments: [...new Set(events.map(e => e.env.environment))],
    },
  })

  try {
    await storeRunEvents(events)
  } catch (err) {
    log.error(err instanceof Error ? err : new Error(String(err)), { ingest: { outcome: 'storage_failed' } })
    setResponseStatus(event, 500)
    return { error: 'storage failed' }
  }

  log.set({ ingest: { outcome: 'stored' } })

  // 204 tells the CLI's outbox the batch delivered — anything else keeps it
  // buffered locally for the next invocation to retry.
  setResponseStatus(event, 204)
  return null
})
