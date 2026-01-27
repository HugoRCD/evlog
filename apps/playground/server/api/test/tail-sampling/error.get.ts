import { createError } from 'evlog'

// Simulates an error response - should always be logged due to tail sampling (status >= 400)
export default defineEventHandler((event) => {
  const log = useLogger(event)

  log.set({ scenario: 'error-request' })

  throw createError({
    status: 404,
    message: 'Not found',
  })
})
