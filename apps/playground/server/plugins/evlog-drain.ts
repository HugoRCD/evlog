// Example drain hook - demonstrates evlog:drain usage
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', (ctx) => {
    // Example: log the event and headers to console (replace with your external service)
    console.log('[DRAIN]', JSON.stringify({
      event: ctx.event,
      request: ctx.request,
      headers: ctx.headers,
    }, null, 2))

    // Example: send to Axiom (uncomment and configure)
    // await fetch('https://api.axiom.co/v1/datasets/logs/ingest', {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${process.env.AXIOM_TOKEN}` },
    //   body: JSON.stringify([ctx.event])
    // })

    // Example: correlate with PostHog using headers (uncomment and configure)
    // const sessionId = ctx.headers?.['x-posthog-session-id']
    // const distinctId = ctx.headers?.['x-posthog-distinct-id']
    // if (distinctId) {
    //   posthog.capture({ distinctId, event: 'server_log', properties: { ...ctx.event, $session_id: sessionId } })
    // }
  })
})
