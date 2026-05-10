import { definePlugin } from 'nitro'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:emit:keep', (ctx) => {
    if (process.env.EVLOG_TEST_LOG === '1') {
      console.log('[TEST:SAMPLING]', JSON.stringify({
        initialShouldKeep: ctx.shouldKeep,
        contextKeys: Object.keys(ctx.context),
        hasUserInContext: 'user' in ctx.context,
        requestPath: ctx.path,
        requestMethod: ctx.method,
        status: ctx.status,
        duration: ctx.duration,
      }))
    }

    if (ctx.context.user && (ctx.context.user as { premium?: boolean }).premium) {
      ctx.shouldKeep = true
    }
  })
})
