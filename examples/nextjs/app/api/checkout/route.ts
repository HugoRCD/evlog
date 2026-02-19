import { withEvlog, useLogger } from '@/lib/evlog'

export const POST = withEvlog(async () => {
  const log = useLogger()

  // Stage 1: User context
  log.set({
    user: { id: 'user_123', email: 'demo@example.com', plan: 'enterprise' },
  })

  // Stage 2: Cart context
  log.set({
    cart: { items: 3, total: 14999, currency: 'USD' },
  })

  // Stage 3: Payment context
  log.set({
    payment: { method: 'card', cardBrand: 'visa', cardLast4: '4242' },
  })

  return Response.json({
    success: true,
    orderId: 'ord_abc123',
    message: 'Checkout completed',
  })
})
