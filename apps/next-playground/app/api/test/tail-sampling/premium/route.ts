import { withEvlog, useLogger } from '@/lib/evlog'

export const GET = withEvlog(async () => {
  const log = useLogger()

  log.set({
    scenario: 'premium-user',
    user: {
      id: 'user-123',
      premium: true,
    },
  })

  return Response.json({
    message: 'Premium user request - always logged via custom keep callback',
  })
})
