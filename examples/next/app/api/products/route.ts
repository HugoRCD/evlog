import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createNextLogger, emitErrorAndRespond } from '../../../lib/evlog'
import { listProducts } from '../../../lib/shop-data'

// eslint-disable-next-line
export function GET(request: NextRequest) {
  const log = createNextLogger(request)
  try {
    const products = listProducts()
    log.set({ catalog: { count: products.length } })
    const response = NextResponse.json({ products })
    log.emit({ status: response.status })
    return response
  } catch (error) {
    return emitErrorAndRespond(log, error)
  }
}
