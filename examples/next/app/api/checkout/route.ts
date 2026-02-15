import { NextResponse } from 'next/server'
import { createError } from 'evlog'

import { withEvlog } from '../../../lib/evlog'
import { createOrder, formatPrice, getCart, getProductById, clearCart } from '../../../lib/shop-data'
import { requireSessionUser } from '../../../lib/session'

type CheckoutBody = {
  paymentMethod?: 'card' | 'declined-card'
}

export const POST = withEvlog(async ({ request, log }) => {
  const user = requireSessionUser(request)
  const body = await request.json() as CheckoutBody
  const paymentMethod = body.paymentMethod ?? 'card'
  const cartLines = getCart(user.id)

  log.set({ user: { id: user.id, tier: user.tier } })
  log.set({ checkout: { paymentMethod, lines: cartLines.length } })

  if (cartLines.length === 0) {
    throw createError({
      message: 'Your cart is empty',
      status: 422,
      why: 'Checkout cannot run without at least one item in cart',
      fix: 'Add one product from the catalog then retry checkout',
    })
  }

  if (paymentMethod === 'declined-card') {
    throw createError({
      message: 'Payment failed',
      status: 402,
      why: 'The selected payment method intentionally simulates a declined card',
      fix: 'Switch payment method to "card" then retry',
    })
  }

  const order = createOrder({
    userId: user.id,
    lines: cartLines,
    paymentMethod,
  })
  clearCart(user.id)
  log.set({ order: { id: order.id, total: order.totalCents, paymentMethod } })

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    total: formatPrice(order.totalCents),
  }, { status: 201 })
})
