export default defineEventHandler((event) => {
  const log = useLogger(event)

  log.set({
    user: {
      id: 'user_123',
      email: 'demo@example.com',
    },
    action: 'login',
  })

  return {
    success: true,
    message: 'Login successful',
  }
})
