import { NextResponse } from 'next/server'

import { withEvlog } from '../../../lib/evlog'
import { listProducts } from '../../../lib/shop-data'

export const GET = withEvlog(async ({ log }) => {
  const products = listProducts()
  log.set({ catalog: { count: products.length } })

  return NextResponse.json({ products })
})
