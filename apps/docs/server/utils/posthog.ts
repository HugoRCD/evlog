/**
 * Fire a PostHog custom event from the server. The capture API accepts the
 * public project key, so this reuses the browser one instead of adding a
 * secret. Failures are logged and swallowed: analytics never decides a
 * request's outcome.
 */
export async function captureServerEvent(event: string, properties: Record<string, unknown>): Promise<void> {
  const key = useRuntimeConfig().public.posthogKey
  if (!key) return

  try {
    await $fetch('https://eu.i.posthog.com/batch/', {
      method: 'POST',
      body: {
        api_key: key,
        batch: [
          {
            event,
            distinct_id: 'evlog-docs-server',
            timestamp: new Date().toISOString(),
            properties: { ...properties, $process_person_profile: false },
          }
        ],
      },
    })
  } catch (error) {
    console.error('[posthog] server capture failed', error)
  }
}
