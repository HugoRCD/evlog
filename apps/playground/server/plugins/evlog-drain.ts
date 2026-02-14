// import { createAxiomDrain } from 'evlog/axiom'
import { createPostHogLogsDrain } from 'evlog/posthog'
// import { createSentryDrain } from 'evlog/sentry'
// import { createBetterStackDrain } from 'evlog/better-stack'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', (ctx) => {
    // console.log('[DRAIN]', JSON.stringify({
    //   event: ctx.event,
    //   request: ctx.request,
    //   headers: ctx.headers,
    // }, null, 2))

    // const axiomDrain = createAxiomDrain({
    //   dataset: 'evlog',
    // })
    // axiomDrain(ctx)

    const posthogDrain = createPostHogLogsDrain()
    posthogDrain(ctx)

    // const sentryDrain = createSentryDrain()
    // sentryDrain(ctx)

    // const betterStackDrain = createBetterStackDrain()
    // betterStackDrain(ctx)
  })
})
