// Simulates a slow request (>500ms) - should always be logged due to tail sampling
export default defineEventHandler(async (event) => {
  const log = useLogger(event)

  log.set({ scenario: 'slow-request' })

  // Simulate slow processing
  await new Promise(resolve => setTimeout(resolve, 600))

  log.set({ processed: true })

  return {
    message: 'This request took >500ms, it should always be logged (tail sampling: duration >= 500)',
  }
})
