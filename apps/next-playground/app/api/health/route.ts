import { withEvlog, useLogger } from '@/lib/evlog'

export const GET = withEvlog(async () => {
  const log = useLogger()
  log.set({ check: 'health' })
  return Response.json({ status: 'ok' })
})
