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
    // Carries `capture_pageview: 'history_change'`, so posthog-js already
    // captures every SPA navigation. A router hook on top of it counts each
    // page twice.
    defaults: '2026-05-30',
    capture_exceptions: true,
  })
})
