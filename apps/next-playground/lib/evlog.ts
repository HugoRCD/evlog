import type { DrainContext } from 'evlog'
import { createEvlog } from 'evlog/next'
import { createUserAgentEnricher, createRequestSizeEnricher } from 'evlog/enrichers'
import { createDrainPipeline } from 'evlog/pipeline'

const enrichers = [createUserAgentEnricher(), createRequestSizeEnricher()]

const pipeline = createDrainPipeline<DrainContext>({ batch: { size: 5, intervalMs: 2000 } })

const drain = pipeline((batch) => {
  for (const ctx of batch) {
    console.log('[DRAIN]', JSON.stringify(ctx.event))
  }
})

export const { withEvlog, useLogger, log, createEvlogError } = createEvlog({
  service: 'next-playground',
  sampling: {
    rates: {
      info: 10,
    },
    keep: [
      { status: 400 },
      { duration: 500 },
      { path: '/api/test/tail-sampling/**' },
      { path: '/api/test/critical/**' },
      { path: '/api/test/drain' },
    ],
  },
  routes: {
    '/api/auth/**': { service: 'auth-service' },
    '/api/checkout': { service: 'checkout-service' },
    '/api/checkout/**': { service: 'checkout-service' },
    '/api/payment/**': { service: 'payment-service' },
    '/api/booking/**': { service: 'booking-service' },
  },
  keep: (ctx) => {
    const user = ctx.context.user as { premium?: boolean } | undefined
    if (user?.premium) ctx.shouldKeep = true
  },
  enrich: (ctx) => {
    for (const enricher of enrichers) enricher(ctx)
    ctx.event.playground = {
      name: 'next-playground',
      enrichedAt: new Date().toISOString(),
    }
  },
  drain,
})
