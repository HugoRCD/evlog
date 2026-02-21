import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { createError } from 'evlog'
import type { RequestLogger } from 'evlog'

export const Route = createFileRoute('/api/checkout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const req = useRequest()
        const log = req.context.log as RequestLogger

        const body = await request.json() as {
          userId: string
          plan: string
          items: { name: string, price: number }[]
          coupon?: string
        }

        log.set({
          user: { id: body.userId, plan: body.plan },
        })

        await new Promise(resolve => setTimeout(resolve, 60))
        const total = body.items.reduce((sum, item) => sum + item.price, 0)
        log.set({
          cart: {
            items: body.items.length,
            total,
            currency: 'USD',
            ...(body.coupon && { coupon: body.coupon, discount: Math.round(total * 0.25) }),
          },
        })

        await new Promise(resolve => setTimeout(resolve, 80))
        log.set({
          payment: { method: 'card', cardBrand: 'visa', cardLast4: '4242' },
          fraud: { score: 85, riskLevel: 'high', passed: false },
        })

        throw createError({
          message: 'Payment failed',
          status: 402,
          why: 'Transaction flagged by fraud detection (risk score: 85/100)',
          fix: 'Verify your billing address matches your card, or try a different payment method',
          link: 'https://docs.example.com/payments/fraud-prevention',
        })
      },
    },
  },
})
