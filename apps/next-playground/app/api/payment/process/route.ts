import { withEvlog, useLogger } from '@/lib/evlog'

export const POST = withEvlog(async () => {
  const log = useLogger()

  log.set({
    payment: {
      amount: 9999,
      currency: 'USD',
      method: 'card',
    },
    action: 'process_payment',
  })

  return Response.json({
    success: true,
    transactionId: 'txn_456',
  })
})
