import posthog from 'posthog-js'
import { shouldDropCapturedException } from '../utils/posthog-exceptions'

/**
 * Consent-tiered analytics: while consent is pending or refused, PostHog runs
 * cookieless (nothing on the device, visitors counted from a server-side hash
 * that rotates daily), so base analytics never depends on the banner. An
 * explicit opt-in (AppConsentBanner) upgrades to cookie-based tracking, which
 * is what unlocks session replay, surveys and full heatmaps.
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
    cookieless_mode: 'on_reject',
    // Required with on_reject: pending consent only falls back to cookieless
    // capture when the default is opt-out; without this flag pending visitors
    // send nothing at all until they answer the banner.
    opt_out_capturing_by_default: true,
    // Carries `capture_pageview: 'history_change'`, so posthog-js already
    // captures every SPA navigation. A router hook on top of it counts each
    // page twice.
    defaults: '2026-05-30',
    // Off in the local dev server: a Vite module error or any other dev-only
    // failure must not ship to the same error tracking project as production.
    capture_exceptions: !import.meta.dev,
    // Drop uncaught exceptions that are not the site's code: browser
    // extensions, and classic cross-origin `Script error.` / Firefox
    // permission-denied events with no first-party frames.
    before_send: (event) => {
      if (event?.event === '$exception' && shouldDropCapturedException(event.properties)) return null
      return event
    },
  })
})
