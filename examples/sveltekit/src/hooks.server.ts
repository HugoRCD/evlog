import type { EnrichContext } from 'evlog'
import { createEvlogHooks } from 'evlog/sveltekit'
import { createPostHogDrain } from 'evlog/posthog'
import { createUserAgentEnricher, createRequestSizeEnricher } from 'evlog/enrichers'

const enrichers = [createUserAgentEnricher(), createRequestSizeEnricher()]

export const { handle, handleError } = createEvlogHooks({
  drain: createPostHogDrain(),

  enrich: (ctx: EnrichContext) => {
    ctx.event.runtime = 'node'
    ctx.event.pid = process.pid
    for (const enricher of enrichers) enricher(ctx)
  },

  keep: (ctx) => {
    if (ctx.status && ctx.status >= 400) ctx.shouldKeep = true
    if (ctx.duration && ctx.duration > 500) ctx.shouldKeep = true
  },
})
