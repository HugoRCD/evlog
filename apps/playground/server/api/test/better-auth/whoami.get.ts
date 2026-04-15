export default defineEventHandler((event) => {
  const log = useLogger(event)
  log.set({ action: 'whoami' })

  const ctx = log.getContext()
  const userId = ctx.userId as string | undefined

  return {
    identified: !!userId,
    userId: userId ?? null,
    user: ctx.user ?? null,
    session: ctx.session ?? null,
  }
})
