import { defineEventHandler } from 'h3'
import { createError } from 'evlog'

export default defineEventHandler(() => {
  throw createError({
    message: 'Payment failed',
    status: 402,
    why: 'Card declined by issuer (insufficient funds)',
    fix: 'Try a different payment method or contact your bank',
    link: 'https://docs.example.com/payments/declined',
  })
})
