// Custom tail sampling hook - demonstrates evlog:emit:keep usage
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:emit:keep', (ctx) => {
    // Always keep logs for premium users
    const user = ctx.context.user as { premium?: boolean } | undefined
    if (user?.premium) {
      ctx.shouldKeep = true
    }
  })
})
