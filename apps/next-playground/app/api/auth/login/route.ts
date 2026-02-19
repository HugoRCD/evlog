import { withEvlog, useLogger } from '@/lib/evlog'

export const POST = withEvlog(async () => {
  const log = useLogger()

  log.set({
    user: {
      id: 'user_123',
      email: 'demo@example.com',
    },
    action: 'login',
  })

  return Response.json({
    success: true,
    message: 'Login successful',
  })
})
