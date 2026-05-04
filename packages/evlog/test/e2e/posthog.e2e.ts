/**
 * E2E smoke test for the PostHog adapter.
 *
 * PostHog's write API key cannot read events back, so this is a one-way
 * smoke test: we hit the real endpoint (PostHog Logs via OTLP, default mode)
 * and trust the absence of an HTTP error to mean the payload format is
 * accepted. If PostHog ever changes the OTLP shape we expect, this fails
 * within 24h via the daily cron, not in production.
 *
 * Required env vars:
 *   - POSTHOG_API_KEY
 *   - POSTHOG_HOST (optional, defaults to https://us.i.posthog.com)
 */
import { expect } from 'vitest'
import {
  sendBatchToPostHog,
  sendBatchToPostHogEvents,
} from '../../src/adapters/posthog'
import { describeIfEnv, itWithCorrelationId, makeEvent } from './_shared'

describeIfEnv('posthog e2e (smoke)', ['POSTHOG_API_KEY'], () => {
  const apiKey = process.env.POSTHOG_API_KEY!
  const host = process.env.POSTHOG_HOST

  itWithCorrelationId('PostHog Logs (OTLP mode) accepts our payload', async () => {
    const events = (['info', 'warn', 'error'] as const).map(level =>
      makeEvent('posthog-otlp', {
        level,
        action: 'e2e_otlp_smoke',
      }),
    )

    await expect(
      sendBatchToPostHog(events, { apiKey, host }),
    ).resolves.toBeUndefined()
  }, 30_000)

  itWithCorrelationId('PostHog batch events API accepts our payload', async () => {
    const events = [
      makeEvent('posthog-events', {
        action: 'e2e_events_smoke',
        userId: 'e2e-user',
      }),
    ]

    await expect(
      sendBatchToPostHogEvents(events, {
        apiKey,
        host,
        mode: 'events',
        eventName: 'evlog_e2e_test',
      }),
    ).resolves.toBeUndefined()
  }, 30_000)

  // Note: PostHog's OTLP and `/batch/` endpoints both return 200 for invalid
  // api keys (they validate asynchronously to keep clients fast). We can't
  // assert on auth rejection at the HTTP layer for this provider.
})
