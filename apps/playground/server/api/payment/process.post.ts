export default defineEventHandler((event) => {
  const log = useLogger(event)

  log.set({
    payment: {
      amount: 9999,
      currency: 'USD',
      method: 'card',
    },
    action: 'process_payment',
  })

  return {
    success: true,
    transactionId: 'txn_456',
  }
})
