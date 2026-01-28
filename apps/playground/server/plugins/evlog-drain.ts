// Example drain hook - demonstrates evlog:drain usage
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', (ctx) => {
    // Example: log the event to console (replace with your external service)
    console.log('[DRAIN]', JSON.stringify(ctx.event, null, 2))

    // Example: send to Axiom (uncomment and configure)
    // await fetch('https://api.axiom.co/v1/datasets/logs/ingest', {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${process.env.AXIOM_TOKEN}` },
    //   body: JSON.stringify([ctx.event])
    // })
  })
})
