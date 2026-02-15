import { NextResponse } from 'next/server'

import { withEvlog } from '../../../lib/evlog'
import { formatPrice, listOrders } from '../../../lib/shop-data'
import { requireSessionUser } from '../../../lib/session'

export const GET = withEvlog(async ({ request, log }) => {
  const user = requireSessionUser(request)
  const orders = listOrders(user.id).map((order) => ({
    ...order,
    total: formatPrice(order.totalCents),
  }))

  log.set({
    user: { id: user.id, tier: user.tier },
    orders: { count: orders.length },
  })

  return NextResponse.json({ orders })
})
