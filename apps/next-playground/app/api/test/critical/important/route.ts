import { withEvlog, useLogger } from '@/lib/evlog'

export const GET = withEvlog(async () => {
  const log = useLogger()

  log.set({ scenario: 'critical-path' })

  return Response.json({
    message: 'Critical path request - always logged (tail sampling: path matches /api/test/critical/**)',
  })
})
