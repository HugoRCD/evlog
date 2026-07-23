/**
 * `GET /api/auth/config` — public. Tells the client whether the password
 * gate is active, so `auth.global.ts` can skip the login redirect entirely
 * when `ANALYTICS_PASSWORD` isn't configured (local dev, quick demos).
 */
export default defineEventHandler((event) => {
  const log = useLogger(event)
  const authRequired = isAuthEnabled()
  log.set({ auth: { required: authRequired } })
  return { authRequired }
})
