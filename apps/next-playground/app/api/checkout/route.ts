import { withEvlog, useLogger } from '@/lib/evlog'

export const POST = withEvlog(async () => {
  const log = useLogger()

  log.set({
    user: {
      id: 'user_123',
      email: 'demo@example.com',
      plan: 'enterprise',
    },
  })

  log.set({
    cart: {
      items: 5,
      total: 24999,
      currency: 'USD',
    },
  })

  log.set({
    payment: {
      method: 'card',
      cardBrand: 'visa',
      cardLast4: '4242',
    },
  })

  log.info('Processing payment')

  return Response.json({
    success: true,
    orderId: 'ord_abc123',
    message: 'Checkout completed',
  })
})
