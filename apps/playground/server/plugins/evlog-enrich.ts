import { auditEnricher } from 'evlog'
import { createRequestSizeEnricher, createUserAgentEnricher } from 'evlog/enrichers'

export default defineNitroPlugin((nitroApp) => {
  const enrichers = [
    createUserAgentEnricher(),
    createRequestSizeEnricher(),
    auditEnricher({ tenantId: () => 'tenant_demo' }),
  ]

  nitroApp.hooks.hook('evlog:enrich', async (ctx) => {
    for (const enricher of enrichers) await enricher(ctx)

    ctx.event.playground = {
      name: 'nuxt-playground',
      enrichedAt: new Date().toISOString(),
    }
  })
})
