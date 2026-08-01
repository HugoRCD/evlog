/**
 * E2E test for the Loki adapter.
 *
 * Loki exposes a query API, so this is a full **round-trip**: push events, then
 * read them back and assert the labels, the log line and the ordering survived.
 * That catches far more than a smoke test — a wrong label set, a malformed
 * nanosecond timestamp or an out-of-order push all fail here.
 *
 * Works against a local container (no cloud account needed):
 *
 *   docker compose -f packages/evlog/test/e2e/docker-compose.yml up -d
 *   LOKI_ENDPOINT=http://localhost:3100 pnpm run test:e2e
 *
 * ...and against Grafana Cloud, by also setting LOKI_USER + LOKI_API_KEY.
 *
 * Required env vars:
 *   - LOKI_ENDPOINT
 * Optional:
 *   - LOKI_USER + LOKI_API_KEY (Grafana Cloud; Basic auth)
 *   - LOKI_TENANT_ID (multi-tenant self-hosted; X-Scope-OrgID)
 */
import { expect } from 'vitest'
import type { WideEvent } from '../../src/types'
import { sendBatchToLoki, toLokiTimestamp } from '../../src/adapters/loki'
import { describeIfEnv, itWithCorrelationId, makeEvent, pollUntil, readEnv } from './_shared'

describeIfEnv('loki e2e (round-trip)', ['LOKI_ENDPOINT'], () => {
  const endpoint = readEnv('LOKI_ENDPOINT')!
  const user = readEnv('LOKI_USER')
  const apiKey = readEnv('LOKI_API_KEY')
  const tenantId = readEnv('LOKI_TENANT_ID')

  const config = { endpoint, user, apiKey, tenantId }

  /** Query the events back through Loki's range API. */
  async function query(selector: string, sinceMs: number): Promise<{ stream: Record<string, string>, values: [string, string][] }[]> {
    const url = new URL('/loki/api/v1/query_range', endpoint)
    url.searchParams.set('query', selector)
    url.searchParams.set('start', `${sinceMs}000000`)
    url.searchParams.set('end', `${Date.now() + 60_000}000000`)
    url.searchParams.set('limit', '100')

    const headers: Record<string, string> = {}
    if (apiKey && user) headers.Authorization = `Basic ${btoa(`${user}:${apiKey}`)}`
    else if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    if (tenantId) headers['X-Scope-OrgID'] = tenantId

    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Loki query failed: ${res.status} ${await res.text()}`)
    const body = await res.json() as { data?: { result?: { stream: Record<string, string>, values: [string, string][] }[] } }
    return body.data?.result ?? []
  }

  itWithCorrelationId('pushes an event and reads it back with its labels intact', async () => {
    const since = Date.now() - 5_000
    const event = makeEvent('loki-roundtrip', {
      method: 'GET',
      path: '/api/e2e',
      status: 200,
    })

    await expect(sendBatchToLoki([event], config)).resolves.toBeUndefined()

    const streams = await pollUntil(
      async () => {
        const found = await query(`{service="evlog-e2e"}`, since)
        const match = found.find(s =>
          s.values.some(([, line]) => line.includes(event.e2e_correlation_id as string)),
        )
        return match ?? null
      },
      { timeoutMs: 30_000, intervalMs: 1_000, label: 'loki-roundtrip' },
    )

    // Labels are the indexed, low-cardinality set — not the whole event.
    expect(streams.stream.service).toBe('evlog-e2e')
    expect(streams.stream.level).toBe('info')
    expect(streams.stream.environment).toBe('test')
    expect(streams.stream.path).toBeUndefined()

    // The full wide event survives as the log line.
    const [, line] = streams.values.find(([, l]) => l.includes(event.e2e_correlation_id as string))!
    const parsed = JSON.parse(line) as WideEvent
    expect(parsed.path).toBe('/api/e2e')
    expect(parsed.status).toBe(200)
    expect(parsed.timestamp).toBe(event.timestamp)
  }, 60_000)

  itWithCorrelationId('accepts a batch spanning several label sets', async () => {
    const since = Date.now() - 5_000
    const events = (['info', 'warn', 'error'] as const).map(level =>
      makeEvent('loki-multi-stream', { level }),
    )

    await expect(sendBatchToLoki(events, config)).resolves.toBeUndefined()

    const levels = await pollUntil(
      async () => {
        // `e2e_test` lives in the JSON line, not the label set — selecting on
        // it returns nothing. Query by label, then match on the correlation id.
        const found = await query(`{service="evlog-e2e"}`, since)
        const seen = new Set(
          found
            .filter(s => s.values.some(([, l]) => events.some(e => l.includes(e.e2e_correlation_id as string))))
            .map(s => s.stream.level),
        )
        return seen.size === 3 ? seen : null
      },
      { timeoutMs: 30_000, intervalMs: 1_000, label: 'loki-multi-stream' },
    )

    expect([...levels].sort()).toEqual(['error', 'info', 'warn'])
  }, 60_000)

  itWithCorrelationId('accepts out-of-order events because the adapter sorts them', async () => {
    // Loki rejects entries older than the newest one already in a stream, so
    // the adapter sorts each stream by timestamp before pushing. Handing it a
    // reversed batch must still succeed.
    const now = Date.now()
    const events = [2, 1, 0].map(offset =>
      makeEvent('loki-ordering', {
        timestamp: new Date(now - offset * 1000).toISOString(),
      }),
    )

    await expect(sendBatchToLoki(events, config)).resolves.toBeUndefined()
  }, 60_000)

  itWithCorrelationId('produces nanosecond timestamps Loki accepts', async () => {
    const event = makeEvent('loki-timestamp')
    const ns = toLokiTimestamp(event.timestamp)
    expect(ns).toMatch(/^\d{19}$/)
    await expect(sendBatchToLoki([event], config)).resolves.toBeUndefined()
  }, 30_000)
})
