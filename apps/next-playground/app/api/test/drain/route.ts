import { withEvlog, useLogger } from '@/lib/evlog'

export const GET = withEvlog(async () => {
  const log = useLogger()

  log.set({
    user: {
      id: 'user_drain_test',
      plan: 'pro',
    },
    action: 'drain_test',
    source: 'playground',
    metadata: {
      testTimestamp: Date.now(),
      adapters: ['axiom', 'otlp', 'posthog'],
    },
  })

  await new Promise(resolve => setTimeout(resolve, 50))

  log.set({
    result: {
      processed: true,
      itemsCount: 42,
      duration: 50,
    },
  })

  return Response.json({
    success: true,
    message: 'Drain test event emitted — check your terminal and configured adapters',
    timestamp: new Date().toISOString(),
  })
})
