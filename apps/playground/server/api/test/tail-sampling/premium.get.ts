// Simulates a premium user request - should always be logged via custom hook
export default defineEventHandler((event) => {
  const log = useLogger(event)

  // Simulate premium user context
  log.set({
    scenario: 'premium-user',
    user: {
      id: 'user-123',
      premium: true,
    },
  })

  return {
    message: 'Premium user request - always logged via evlog:emit:keep hook',
  }
})
