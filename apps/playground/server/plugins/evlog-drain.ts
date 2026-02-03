import { createAxiomDrain } from 'evlog/axiom'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', (ctx) => {
    console.log('[DRAIN]', JSON.stringify({
      event: ctx.event,
      request: ctx.request,
      headers: ctx.headers,
    }, null, 2))

    // const axiomDrain = createAxiomDrain({
    //   dataset: 'evlog',
    // })

    // axiomDrain(ctx)
  })
})
