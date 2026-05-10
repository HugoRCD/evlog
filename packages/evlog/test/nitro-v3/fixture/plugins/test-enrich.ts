import { definePlugin } from 'nitro'
import type { EnrichContext } from '../../../../src/types'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:enrich', (ctx: EnrichContext) => {
    if (process.env.EVLOG_TEST_LOG === '1') {
      console.log('[TEST:ENRICH]', JSON.stringify({
        eventLevel: ctx.event.level,
        hasCustomField: 'customEnrichment' in ctx.event,
        requestPath: ctx.request?.path,
        headerKeys: ctx.headers ? Object.keys(ctx.headers).sort() : [],
      }))
    }

    ctx.event.customEnrichment = 'enriched'
  })
})
