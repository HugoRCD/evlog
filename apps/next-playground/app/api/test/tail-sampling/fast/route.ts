import { withEvlog, useLogger } from '@/lib/evlog'

export const GET = withEvlog(async () => {
  const log = useLogger()
  log.set({ scenario: 'fast-request' })

  return Response.json({
    message: 'Fast request - only 10% of these will be logged (head sampling)',
  })
})
