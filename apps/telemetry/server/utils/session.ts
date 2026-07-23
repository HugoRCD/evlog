import type { H3Event } from 'h3'

/**
 * The password gate is opt-in: it only activates once `ANALYTICS_PASSWORD`
 * is set. Unset locally (or in a quick demo deploy) and the dashboard is
 * open — no login required.
 */
export function isAuthEnabled(): boolean {
  return !!process.env.ANALYTICS_PASSWORD
}

/** No-op when the password gate is disabled; otherwise delegates to `nuxt-auth-utils`. */
export async function requireDashboardSession(event: H3Event): Promise<void> {
  if (!isAuthEnabled()) return
  await requireUserSession(event)
}
