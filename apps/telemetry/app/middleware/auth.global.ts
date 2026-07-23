/**
 * Redirects unauthenticated visitors to `/login`. `/api/telemetry/ingest`
 * lives outside this guard (server routes, not pages) so the CLI can keep
 * posting without a session.
 *
 * Skipped entirely when `ANALYTICS_PASSWORD` isn't configured — local dev
 * and quick demos don't need a login screen.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const authRequired = await loadAuthRequired()
  if (!authRequired) return

  if (to.path === '/login') return

  const { loggedIn, fetch } = useUserSession()
  if (!loggedIn.value) {
    await fetch()
  }
  if (!loggedIn.value) {
    return navigateTo('/login')
  }
})
