import { withEvlog, useLogger, createEvlogError } from '@/lib/evlog'

export const GET = withEvlog(async () => {
  const log = useLogger()
  log.set({ scenario: 'structured-error' })

  throw createEvlogError({
    message: 'Payment method declined',
    status: 402,
    why: 'The card issuer rejected the transaction due to insufficient funds',
    fix: 'Try a different payment method or contact your bank',
    link: 'https://evlog.dev/errors/payment-declined',
  })
})
