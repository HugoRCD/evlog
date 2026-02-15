import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createError } from 'evlog'

import { createNextLogger, emitErrorAndRespond } from '../../../lib/evlog'
import { addToCart, formatPrice, getCart, getProductById } from '../../../lib/shop-data'
import { requireSessionUser } from '../../../lib/session'

type AddToCartBody = {
  productId?: string
  quantity?: number
}

function serializeCart(userId: string) {
  const lines = getCart(userId)
  const items = lines.map((line) => {
    const product = getProductById(line.productId)
    if (!product) {
      return null
    }
    const lineTotalCents = product.priceCents * line.quantity
    return {
      productId: line.productId,
      quantity: line.quantity,
      product,
      lineTotalCents,
      lineTotal: formatPrice(lineTotalCents),
    }
  }).filter(Boolean)

  const totalCents = items.reduce((total, item) => item ? total + item.lineTotalCents : total, 0)
  return {
    items,
    totalCents,
    total: formatPrice(totalCents),
  }
}

// eslint-disable-next-line
export function GET(request: NextRequest) {
  const log = createNextLogger(request)
  try {
    const user = requireSessionUser(request)
    const cart = serializeCart(user.id)
    log.set({ cart: { items: cart.items.length, total: cart.totalCents } })
    const response = NextResponse.json(cart)
    log.emit({ status: response.status })
    return response
  } catch (error) {
    return emitErrorAndRespond(log, error)
  }
}

// eslint-disable-next-line
export async function POST(request: NextRequest) {
  const log = createNextLogger(request)
  try {
    const user = requireSessionUser(request)
    const body = await request.json() as AddToCartBody
    const quantity = Math.max(1, body.quantity ?? 1)

    if (!body.productId) {
      throw createError({
        message: 'Missing product',
        status: 400,
        why: 'No productId provided in add-to-cart payload',
        fix: 'Send { "productId": "sku_hoodie", "quantity": 1 }',
        link: 'https://evlog.dev/core-concepts/structured-errors',
      })
    }

    const product = getProductById(body.productId)
    if (!product) {
      throw createError({
        message: 'Unknown product',
        status: 404,
        why: `Product "${body.productId}" does not exist`,
        fix: 'Use one of the products returned by GET /api/products',
        link: 'https://evlog.dev/core-concepts/structured-errors',
      })
    }

    addToCart(user.id, product.id, quantity)
    const cart = serializeCart(user.id)
    log.set({
      user: { id: user.id, tier: user.tier },
      cart: { action: 'add', productId: product.id, quantity, total: cart.totalCents },
    })

    const response = NextResponse.json(cart, { status: 201 })
    log.emit({ status: response.status })
    return response
  } catch (error) {
    return emitErrorAndRespond(log, error)
  }
}
