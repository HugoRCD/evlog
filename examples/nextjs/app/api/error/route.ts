import { withEvlog, useLogger, createError } from '@/lib/evlog'

export const GET = withEvlog(async () => {
  const log = useLogger()

  log.set({
    user: { id: 'user_456', plan: 'free' },
    action: 'subscription_upgrade',
  })

  throw createError({
    status: 402,
    message: 'Payment required',
    why: 'Free plan does not include this feature',
    fix: 'Upgrade to a paid plan to access this endpoint',
    link: 'https://docs.example.com/pricing',
  })
})
