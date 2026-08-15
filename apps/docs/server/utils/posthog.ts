/**
 * Fire a PostHog custom event from the server. The capture API accepts the
 * public project key, so this reuses the browser one instead of adding a
 * secret. A no-op when no key is configured, and failures are logged and
 * swallowed: analytics never decides a request's outcome.
 *
 * @param event Event name, e.g. `mcp_tool_called`
 * @param properties Event properties; sent anonymously, no person profile
 */
export async function captureServerEvent(event: string, properties: Record<string, unknown>): Promise<void> {
  const key = useRuntimeConfig().public.posthogKey
  if (!key) return

  try {
    await $fetch('https://eu.i.posthog.com/batch/', {
      method: 'POST',
      // The caller awaits this inside a request handler; a slow ingest
      // endpoint must not hold the response open.
      timeout: 2000,
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
