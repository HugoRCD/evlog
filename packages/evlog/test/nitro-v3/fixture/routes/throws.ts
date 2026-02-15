import { defineHandler } from 'nitro/h3'
import { createError, useLogger } from 'evlog'

export default defineHandler((event) => {
  const log = useLogger(event)

  log.set({ user: { id: 42, plan: 'enterprise' } })
  log.set({ transaction: { id: 'txn_123', amount: 5000 } })
  log.set({ attempt: { count: 3, method: 'credit_card' } })

  throw createError({
    message: 'Payment failed',
    status: 402,
    why: 'Card declined by issuer (insufficient funds)',
    fix: 'Try a different payment method or contact your bank',
    link: 'https://docs.example.com/payments/declined',
  })
})
