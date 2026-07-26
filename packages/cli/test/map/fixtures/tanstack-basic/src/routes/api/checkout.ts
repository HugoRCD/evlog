import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { createError } from 'evlog'
import type { RequestLogger } from 'evlog'

export const Route = createFileRoute('/api/checkout')({
  server: {
    handlers: {
      POST: async () => {
        const req = useRequest()
        const log = req.context.log as RequestLogger

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
