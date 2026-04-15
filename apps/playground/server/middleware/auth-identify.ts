import { createAuthMiddleware } from 'evlog/better-auth'

const identify = createAuthMiddleware(auth, {
  exclude: ['/api/auth/**'],
})

export default defineEventHandler(async (event) => {
  if (!event.context.log) return
  await identify(event.context.log, event.headers, event.path)
})
