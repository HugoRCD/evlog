import { defineEvlogHook } from 'evlog/eve'
import { createFsDrain } from 'evlog/fs'
import { createPostHogDrain } from 'evlog/posthog'
import { createFanOutDrain } from '../lib/drains'
import { environment } from '../lib/environment'

/** The fs drain needs a writable filesystem, which Vercel only offers under /tmp. */
const drain = createFanOutDrain(
  [
    ...(process.env.VERCEL ? [] : [createFsDrain()]),
    ...(process.env.POSTHOG_API_KEY
      // Events, not Logs: at a few dozen turns a day the per-GB saving is
      // irrelevant and only events can be charted and alerted on.
      ? [createPostHogDrain({
          mode: 'events',
          eventName: 'evi_turn',
          distinctIdField: 'eve.caller.principalId',
          recordShape: 'compact',
        })]
      : []),
  ],
  { batch: { size: 5, intervalMs: 2000 } },
)

export default defineEvlogHook({
  init: { env: { service: 'evi', environment: environment() } },
  ...(drain ? { drain } : {}),
  sessionEvent: true,
})
