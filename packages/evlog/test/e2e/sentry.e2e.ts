/**
 * E2E smoke test for the Sentry adapter.
 *
 * The Sentry DSN is write-only, so we cannot read events back. Instead we send
 * to the real Envelope endpoint and assert no HTTP error. Sentry returns
 * 200 with `{"id": "..."}` on success — `httpPost` only throws on non-2xx,
 * so absence of error == acceptance.
 *
 * Required env vars:
 *   - SENTRY_DSN
 */
import { expect } from 'vitest'
import { sendBatchToSentry, toSentryLog } from '../../src/adapters/sentry'
import { describeIfEnv, itWithCorrelationId, makeEvent } from './_shared'

describeIfEnv('sentry e2e (smoke)', ['SENTRY_DSN'], () => {
  const dsn = process.env.SENTRY_DSN!

  itWithCorrelationId('Sentry envelope endpoint accepts info / warn / error logs', async () => {
    const events = (['info', 'warn', 'error'] as const).map(level =>
      makeEvent('sentry-smoke', {
        level,
        message: `e2e ${level} log from evlog tests`,
      }),
    )

    await expect(sendBatchToSentry(events, { dsn })).resolves.toBeUndefined()
  }, 30_000)

  itWithCorrelationId('toSentryLog produces a payload Sentry accepts', async () => {
    const event = makeEvent('sentry-shape', {
      level: 'error',
      message: 'shape check',
      userId: 'e2e-user',
      cart: { items: 3, total: 9999 },
    })

    const log = toSentryLog(event, { dsn })
    expect(log.body).toBeTruthy()
    expect(log.level).toBe('error')
    expect(typeof log.timestamp).toBe('number')
    expect(typeof log.trace_id).toBe('string')
    expect(log.attributes?.service).toBeDefined()

    await expect(sendBatchToSentry([event], { dsn })).resolves.toBeUndefined()
  }, 30_000)

  itWithCorrelationId('rejects an invalid DSN', async () => {
    await expect(
      sendBatchToSentry([makeEvent('sentry-invalid-dsn')], {
        dsn: 'https://invalid@o0.ingest.sentry.io/999999999',
      }),
    ).rejects.toThrow()
  }, 30_000)
})
