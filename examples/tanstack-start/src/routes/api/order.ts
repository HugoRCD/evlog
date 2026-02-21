import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import type { RequestLogger } from 'evlog'

export const Route = createFileRoute('/api/order')({
  server: {
    handlers: {
      GET: async () => {
        const req = useRequest()
        const log = req?.context?.log as RequestLogger

        log.set({
          user: {
            id: 'user_789',
            email: 'demo@example.com',
            plan: 'enterprise',
            accountAge: '2 years',
            role: 'admin',
          },
          session: { device: 'desktop', browser: 'Chrome 130', country: 'FR' },
        })

        await new Promise(resolve => setTimeout(resolve, 80))
        log.set({
          cart: {
            items: 5,
            total: 24999,
            currency: 'USD',
            discount: { code: 'WINTER25', savings: 8333 },
          },
        })

        await new Promise(resolve => setTimeout(resolve, 80))
        log.set({
          payment: { method: 'card', cardBrand: 'visa', cardLast4: '4242' },
          fraud: { score: 12, riskLevel: 'low', passed: true },
        })

        await new Promise(resolve => setTimeout(resolve, 60))
        log.set({
          fulfillment: { warehouse: 'eu-west-1', estimatedDays: 3 },
          performance: { dbQueries: 8, cacheHits: 12, cacheMisses: 2 },
          flags: { newCheckoutFlow: true, experimentId: 'exp_checkout_v2' },
        })

        return Response.json({
          success: true,
          orderId: 'ord_abc123xyz',
          estimatedDelivery: '2026-02-24',
        })
      },
    },
  },
})
