import { HTTPError, defineHandler } from 'nitro/h3'

export default defineHandler(() => {
  throw new HTTPError({
    status: 500,
    message: 'Payment provider rejected the charge',
    data: { orderId: 'ord_1', retryable: true },
  })
})
