import { withEvlog, useLogger } from '@/lib/evlog'

export const GET = withEvlog(async () => {
  const log = useLogger()
  log.set({ scenario: 'slow-request' })

  await new Promise(resolve => setTimeout(resolve, 600))

  log.set({ processed: true })

  return Response.json({
    message: 'This request took >500ms, it should always be logged (tail sampling: duration >= 500)',
  })
})
