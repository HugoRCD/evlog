// Simulates a fast request - only 10% will be logged (head sampling)
export default defineEventHandler((event) => {
  const log = useLogger(event)

  log.set({ scenario: 'fast-request' })

  return {
    message: 'Fast request - only 10% of these will be logged (head sampling)',
  }
})
