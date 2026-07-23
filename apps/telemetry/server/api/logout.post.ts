/** `POST /api/logout` — clears the dashboard session. */
export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  await clearUserSession(event)
  log.set({ auth: { action: 'logout' } })
  return { ok: true }
})
