import posthog from 'posthog-js'

/**
 * Cookieless analytics: PostHog stores nothing on the device and counts a
 * visitor from a server-side hash that rotates daily, so the site needs no
 * consent banner. Session replay and surveys are unavailable in this mode.
 *
 * Requires "Cookieless server hash mode" in the project's web analytics
 * settings.
 */
export default defineNuxtPlugin(() => {
  const key = useRuntimeConfig().public.posthogKey
  if (!key) return

  posthog.init(key, {
    // Ingestion through the site's own origin; blockers drop the PostHog one.
    api_host: '/_ph',
    ui_host: 'https://eu.posthog.com',
    cookieless_mode: 'always',
    defaults: '2026-05-30',
    capture_exceptions: true,
  })

  const router = useRouter()
  router.afterEach((to) => {
    posthog.capture('$pageview', { $current_url: to.fullPath })
  })
})
