import { useLogger } from 'evlog/sveltekit'
import { createError } from 'evlog'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = () => {
  const log = useLogger()
  log.set({ user: { id: 'user_456', plan: 'free' }, action: 'checkout' })

  throw createError({
    message: 'Payment failed',
    status: 402,
    why: 'Card declined by issuer',
    fix: 'Try a different card or payment method',
    link: 'https://docs.example.com/payments/declined',
  })
}
