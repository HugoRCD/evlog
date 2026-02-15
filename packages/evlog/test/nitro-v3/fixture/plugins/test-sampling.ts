import { definePlugin } from 'nitro'

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:emit:keep', (ctx) => {
    console.log('[TEST:SAMPLING]', JSON.stringify({
      initialShouldKeep: ctx.shouldKeep,
      contextKeys: Object.keys(ctx.context),
      hasUserInContext: 'user' in ctx.context,
      requestPath: ctx.path,
      requestMethod: ctx.method,
      status: ctx.status,
      duration: ctx.duration,
    }))
    
    // Custom tail sampling logic for testing
    if (ctx.context.user && (ctx.context.user as any).premium) {
      ctx.shouldKeep = true
    }
  })
})
