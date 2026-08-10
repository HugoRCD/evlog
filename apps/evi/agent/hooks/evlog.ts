import { defineEvlogHook } from 'evlog/eve'
import { createFsDrain } from 'evlog/fs'
import { createPostHogDrain } from 'evlog/posthog'
import { createFanOutDrain } from '../lib/drains'
import { environment } from '../lib/environment'

/**
 * The fs drain requires a writable filesystem, which Vercel only offers under
 * /tmp. PostHog Logs is the hosted destination, and is skipped without a key.
 *
 * Turns are attributed to the principal that opened the session — the same id
 * the instrumentation stamps on the model-call spans — so a wide event and the
 * generations it produced land on one PostHog person.
 */
const drain = createFanOutDrain(
  [
    ...(process.env.VERCEL ? [] : [createFsDrain()]),
    ...(process.env.POSTHOG_API_KEY
      ? [createPostHogDrain({ distinctIdField: 'eve.caller.principalId' })]
      : []),
  ],
  { batch: { size: 5, intervalMs: 2000 } },
)

export default defineEvlogHook({
  init: { env: { service: 'evi', environment: environment() } },
  ...(drain ? { drain } : {}),
  sessionEvent: true,
})
