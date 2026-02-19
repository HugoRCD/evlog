import type { DrainContext } from 'evlog'
import { createEvlog } from 'evlog/next'
import { createUserAgentEnricher, createRequestSizeEnricher } from 'evlog/enrichers'
import { createDrainPipeline } from 'evlog/pipeline'

// 1. Enrichers — add derived context to every event
const enrichers = [createUserAgentEnricher(), createRequestSizeEnricher()]

// 2. Pipeline — batch events before sending
const pipeline = createDrainPipeline<DrainContext>({ batch: { size: 5, intervalMs: 2000 } })

// 3. Drain — log batched events to console (swap with createAxiomDrain() for production)
const drain = pipeline((batch) => {
  for (const ctx of batch) {
    console.log('[DRAIN]', JSON.stringify(ctx.event))
  }
})

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: 'nextjs-example',

  // 4. Head sampling — keep 10% of info logs
  sampling: {
    rates: { info: 10 },
    keep: [
      { status: 400 },
      { duration: 1000 },
      { path: '/api/checkout/**' },
    ],
  },

  // 5. Route-based service names
  routes: {
    '/api/auth/**': { service: 'auth-service' },
    '/api/checkout/**': { service: 'checkout-service' },
  },

  // 6. Custom tail sampling — always keep premium users
  keep: (ctx) => {
    const user = ctx.context.user as { premium?: boolean } | undefined
    if (user?.premium) ctx.shouldKeep = true
  },

  // 7. Enrich every event
  enrich: (ctx) => {
    for (const enricher of enrichers) enricher(ctx)
  },

  drain,
})
