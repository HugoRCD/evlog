import { initLogger, type EnrichContext } from 'evlog'
import { createEvlogHooks } from 'evlog/sveltekit'
import { createPostHogDrain } from 'evlog/posthog'
import { createUserAgentEnricher, createRequestSizeEnricher } from 'evlog/enrichers'

// 1. Enrichers — add derived context to every event
const enrichers = [createUserAgentEnricher(), createRequestSizeEnricher()]

initLogger({
  env: { service: 'sveltekit-example' },
  pretty: true,
})

export const { handle, handleError } = createEvlogHooks({
  // 2. Drain — send events to PostHog (set POSTHOG_API_KEY env var)
  drain: createPostHogDrain(),

  // 3. Enrich every event with runtime info + request enrichers
  enrich: (ctx: EnrichContext) => {
    ctx.event.runtime = 'node'
    ctx.event.pid = process.pid
    for (const enricher of enrichers) enricher(ctx)
  },

  // 4. Tail sampling — always keep errors and slow requests
  keep: (ctx) => {
    if (ctx.status && ctx.status >= 400) ctx.shouldKeep = true
    if (ctx.duration && ctx.duration > 500) ctx.shouldKeep = true
  },
})
