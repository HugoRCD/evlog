import { NextResponse } from 'next/server'
import { createError } from 'evlog'

import { withEvlog } from '../../../lib/evlog'

type CheckoutBody = {
  productId?: string
  quantity?: number
  failPayment?: boolean
}

export const POST = withEvlog(async ({ request, log }) => {
  const body = await request.json() as CheckoutBody
  const quantity = Math.max(1, body.quantity ?? 1)

  log.set({
    checkout: {
      productId: body.productId ?? null,
      quantity,
    },
  })

  if (!body.productId) {
    throw createError({
      message: 'Missing product',
      status: 400,
      why: 'The request body has no productId',
      fix: 'Send { "productId": "sku_123" } in the JSON body',
    })
  }

  if (body.failPayment) {
    throw createError({
      message: 'Payment failed',
      status: 402,
      why: 'Card declined by issuer',
      fix: 'Use another card or retry later',
    })
  }

  const orderId = `ord_${Math.random().toString(36).slice(2, 10)}`
  log.set({ order: { id: orderId, status: 'created' } })

  return NextResponse.json({
    ok: true,
    orderId,
  }, { status: 201 })
})
