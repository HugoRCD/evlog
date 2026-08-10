import type { DrainContext } from 'evlog'
import { defineEvlogHook } from 'evlog/eve'
import { createFsDrain } from 'evlog/fs'
import { createDrainPipeline } from 'evlog/pipeline'
import { createPostHogDrain } from 'evlog/posthog'
import { environment } from '../lib/environment'

/**
 * The fs drain only runs where the filesystem is writable. On Vercel
 * everything outside /tmp is read-only, so attaching it there errored on every
 * flush and persisted nothing; PostHog Logs is the hosted destination.
 *
 * Turns are attributed to the principal that opened the session — the same id
 * the instrumentation stamps on the model-call spans — so a wide event and the
 * generations it produced land on one PostHog person.
 */
const drains = [
  ...(process.env.VERCEL ? [] : [createFsDrain()]),
  ...(process.env.POSTHOG_API_KEY
    ? [createPostHogDrain({ distinctIdField: 'eve.caller.principalId' })]
    : []),
]

const drain = drains.length > 0
  ? createDrainPipeline<DrainContext>({
      batch: { size: 5, intervalMs: 2000 },
    })(async (batch) => {
      await Promise.allSettled(drains.map(send => send(batch)))
    })
  : undefined

export default defineEvlogHook({
  init: { env: { service: 'evi', environment: environment() } },
  ...(drain ? { drain } : {}),
  sessionEvent: true,
})
