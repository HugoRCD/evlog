import { createFileRoute } from '@tanstack/react-router'
import { createError, useLogger } from 'evlog'

export const Route = createFileRoute('/api/checkout')({
  server: {
    handlers: {
      POST: async () => {
        const log = useLogger()
        log.set({ cart: { total: 100 } })
        log.audit({ action: 'checkout' })
        throw createError({
          message: 'Payment failed',
          why: 'Card declined',
          fix: 'Try another card',
        })
      },
    },
  },
})
