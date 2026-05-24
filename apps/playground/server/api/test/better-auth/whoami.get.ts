export default defineEventHandler((event) => {
  const log = useLogger(event)
  log.set({ action: 'whoami' })

  const ctx = log.getContext()
  const userId = typeof ctx.userId === 'string' ? ctx.userId : undefined

  return {
    identified: !!userId,
    userId: userId ?? null,
    user: ctx.user ?? null,
    session: ctx.session ?? null,
  }
})
