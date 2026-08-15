import posthog from 'posthog-js'

/**
 * Capture a product analytics event. A no-op on the server and when PostHog
 * did not initialize (no key configured, e.g. local dev).
 */
export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  if (!import.meta.client || !posthog.__loaded) return
  posthog.capture(event, properties)
}
