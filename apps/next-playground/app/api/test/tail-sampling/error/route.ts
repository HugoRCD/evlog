import { withEvlog, useLogger, createEvlogError } from '@/lib/evlog'

export const GET = withEvlog(async () => {
  const log = useLogger()
  log.set({ scenario: 'error-response' })

  throw createEvlogError({
    message: 'Resource not found',
    status: 404,
    why: 'The requested item does not exist in the database',
    fix: 'Check the item ID and try again',
  })
})
