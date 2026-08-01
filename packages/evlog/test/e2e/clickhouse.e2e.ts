/**
 * E2E test for the ClickHouse adapter.
 *
 * ClickHouse can be read back over the same HTTP interface it is written
 * through, so this is a full **round-trip**: insert events, `SELECT` them back
 * and assert the typed columns and the `data` JSON survived. A column-type
 * mismatch, a `null` where ClickHouse wants a value, or a schema drift all fail
 * here rather than in production.
 *
 * Works against a local container (no cloud account needed):
 *
 *   docker compose -f packages/evlog/test/e2e/docker-compose.yml up -d
 *   CLICKHOUSE_ENDPOINT=http://localhost:8123 pnpm run test:e2e
 *
 * ...and against ClickHouse Cloud, by also setting CLICKHOUSE_PASSWORD.
 *
 * Required env vars:
 *   - CLICKHOUSE_ENDPOINT
 * Optional:
 *   - CLICKHOUSE_USER (default `default`), CLICKHOUSE_PASSWORD
 *   - CLICKHOUSE_DATABASE (default `default`), CLICKHOUSE_TABLE (default `evlog_events`)
 */
import { expect } from 'vitest'
import { sendBatchToClickHouse, toClickHouseRow } from '../../src/adapters/clickhouse'
import { describeIfEnv, itWithCorrelationId, makeEvent, pollUntil, readEnv } from './_shared'

describeIfEnv('clickhouse e2e (round-trip)', ['CLICKHOUSE_ENDPOINT'], () => {
  const endpoint = readEnv('CLICKHOUSE_ENDPOINT')!
  const username = readEnv('CLICKHOUSE_USER')
  const password = readEnv('CLICKHOUSE_PASSWORD')
  const database = readEnv('CLICKHOUSE_DATABASE')
  const table = readEnv('CLICKHOUSE_TABLE') ?? 'evlog_events'

  const config = { endpoint, username, password, database, table }

  /** Run a read query through the HTTP interface, returning JSONEachRow lines. */
  async function select<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const url = new URL('/', endpoint)
    url.searchParams.set('query', `${sql} FORMAT JSONEachRow`)
    if (database) url.searchParams.set('database', database)

    const headers: Record<string, string> = { 'X-ClickHouse-User': username ?? 'default' }
    if (password) headers['X-ClickHouse-Key'] = password

    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`ClickHouse query failed: ${res.status} ${await res.text()}`)
    const text = await res.text()
    return text.split('\n').filter(Boolean).map(line => JSON.parse(line) as T)
  }

  /**
   * Async inserts are fire-and-forget by default, so a freshly written row is
   * not immediately visible — poll rather than asserting straight away.
   */
  function findByCorrelationId(id: string) {
    return pollUntil(
      async () => {
        const rows = await select<Record<string, unknown>>(
          `SELECT * FROM ${table} WHERE JSONExtractString(data, 'e2e_correlation_id') = '${id}' LIMIT 1`,
        )
        return rows[0] ?? null
      },
      { timeoutMs: 30_000, intervalMs: 1_000, label: 'clickhouse-roundtrip' },
    )
  }

  itWithCorrelationId('inserts an event and reads back its typed columns', async () => {
    const event = makeEvent('clickhouse-roundtrip', {
      method: 'POST',
      path: '/api/e2e',
      status: 201,
      requestId: 'e2e-req-1',
    })

    await expect(sendBatchToClickHouse([event], config)).resolves.toBeUndefined()

    const row = await findByCorrelationId(event.e2e_correlation_id as string)
    expect(row.service).toBe('evlog-e2e')
    expect(row.environment).toBe('test')
    expect(row.level).toBe('info')
    expect(row.method).toBe('POST')
    expect(row.path).toBe('/api/e2e')
    expect(Number(row.status)).toBe(201)
    expect(row.request_id).toBe('e2e-req-1')

    // Nothing is lost: the untyped remainder survives in `data`.
    const data = JSON.parse(row.data as string) as Record<string, unknown>
    expect(data.e2e).toBe(true)
    expect(data.e2e_test).toBe('clickhouse-roundtrip')
  }, 60_000)

  itWithCorrelationId('accepts an event with no HTTP fields (nullable status)', async () => {
    // A non-HTTP event has no `status`; the row must insert with NULL rather
    // than being rejected for a type mismatch.
    const event = makeEvent('clickhouse-nullable', { action: 'cron_tick' })
    expect(toClickHouseRow(event).status).toBeNull()

    await expect(sendBatchToClickHouse([event], config)).resolves.toBeUndefined()

    const row = await findByCorrelationId(event.e2e_correlation_id as string)
    expect(row.status).toBeNull()
    expect(row.method).toBe('')
  }, 60_000)

  itWithCorrelationId('flattens a structured error into its columns', async () => {
    const event = makeEvent('clickhouse-error', {
      level: 'error',
      status: 500,
      error: { name: 'PaymentDeclined', message: 'Card declined by issuer' },
    })

    await expect(sendBatchToClickHouse([event], config)).resolves.toBeUndefined()

    const row = await findByCorrelationId(event.e2e_correlation_id as string)
    expect(row.level).toBe('error')
    expect(row.error_name).toBe('PaymentDeclined')
    expect(row.error_message).toBe('Card declined by issuer')
  }, 60_000)

  itWithCorrelationId('inserts a multi-event batch in one request', async () => {
    const events = (['info', 'warn', 'error'] as const).map(level =>
      makeEvent('clickhouse-batch', { level }),
    )

    await expect(sendBatchToClickHouse(events, config)).resolves.toBeUndefined()

    for (const event of events) {
      const row = await findByCorrelationId(event.e2e_correlation_id as string)
      expect(row.level).toBe(event.level)
    }
  }, 90_000)

  itWithCorrelationId('rejects an insert into a table that does not exist', async () => {
    await expect(
      sendBatchToClickHouse([makeEvent('clickhouse-bad-table')], {
        ...config,
        table: 'evlog_events_does_not_exist',
        // Wait for the ack, otherwise an async insert would swallow the error.
        asyncInsert: false,
        retries: 0,
      }),
    ).rejects.toThrow(/ClickHouse API error/)
  }, 30_000)
})
