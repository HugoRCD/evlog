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

/**
 * `nuxt-auth-utils` (via h3's iron-webcrypto sealing) silently requires a
 * 32+ character `NUXT_SESSION_PASSWORD` to encrypt the session cookie — set
 * it too short (or reuse `ANALYTICS_PASSWORD`, which is often short and
 * memorable) and the seal call throws deep inside `setUserSession`, well
 * after the password check already passed. Checking this upfront lets the
 * login route fail with an actionable error instead of a cryptic one.
 */
export function isSessionSecretValid(secret: string | undefined): boolean {
  return !!secret && secret.length >= 32
}
