import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createNextLogger, emitErrorAndRespond } from '../../../lib/evlog'
import { formatPrice, listOrders } from '../../../lib/shop-data'
import { requireSessionUser } from '../../../lib/session'

export async function GET(request: NextRequest) {
  const log = createNextLogger(request)
  try {
    const user = requireSessionUser(request)
    const orders = listOrders(user.id).map((order) => ({
      ...order,
      total: formatPrice(order.totalCents),
    }))

    log.set({
      user: { id: user.id, tier: user.tier },
      orders: { count: orders.length },
    })

    const response = NextResponse.json({ orders })
    log.emit({ status: response.status })
    return response
  } catch (error) {
    return emitErrorAndRespond(log, error)
  }
}
