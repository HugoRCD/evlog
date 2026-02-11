export default defineEventHandler((event) => {
  const logger = useLogger(event)
  logger.set({ action: 'test-error', user: { id: 'user-2', plan: 'free' } })

  throw createEvlogError({
    message: 'Payment processing failed',
    status: 500,
    why: 'Stripe API returned a card_declined error for the provided payment method',
    fix: 'Use a different payment method or contact your bank to authorize the transaction',
    link: 'https://docs.stripe.com/declines/codes',
  })
})
