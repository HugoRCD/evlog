import { createError, defineEventHandler } from 'h3'

export default defineEventHandler(() => {
  throw createError({
    status: 500,
    message: 'Payment provider rejected the charge',
    data: { orderId: 'ord_1', retryable: true },
  })
})
