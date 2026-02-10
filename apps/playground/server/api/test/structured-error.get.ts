import { createError, useLogger } from 'evlog'

interface PurchaseFlowFields {
  user: {
    id: string
    email: string
    plan: string
    accessLevel: string
    companyId: string
    companyName: string
  },
  action: string,
  flow: string,
  order: {
    id: string
    items: number
    subtotal: number
    tax: number
    total: number
    currency: string
  }
  verification: {
    threeDSecure: boolean
    threeDSecureVersion: string
    authenticationStatus: string
    challengeCompleted: boolean
  }
  riskAssessment: {
    score: number
    level: string
    signals: string[]
    requiresReview: boolean
  }
  attempt: {
    number: number
    maxRetries: number
    processorLatency: number
    timeout: boolean
  }
  billing: {
    method: string
    cardId: string
    cardBrand: string
    cardLast4: string
    billingEmail: string
  }
}

export default defineEventHandler(async (event) => {
  const logger = useLogger<PurchaseFlowFields>(event)

  logger.set({
    user: {
      id: 'user_789',
      email: 'alex.johnson@enterprise.com',
      plan: 'premium',
      accessLevel: 'admin',
      companyId: 'comp_xyz789',
      companyName: 'Enterprise Corp',
    },
    action: 'checkout',
    flow: 'one_click_purchase',
  })

  await new Promise(resolve => setTimeout(resolve, 100))
  logger.set({
    order: {
      id: 'ord_pending_123',
      items: 3,
      subtotal: 45000,
      tax: 4500,
      total: 49500,
      currency: 'USD',
    },
    billing: {
      method: 'saved_card',
      cardId: 'card_abc123',
      cardBrand: 'amex',
      cardLast4: '1234',
      billingEmail: 'billing@enterprise.com',
    },
  })

  await new Promise(resolve => setTimeout(resolve, 100))
  logger.set({
    verification: {
      threeDSecure: true,
      threeDSecureVersion: '2.0',
      authenticationStatus: 'challenge_required',
      challengeCompleted: false,
    },
    riskAssessment: {
      score: 45,
      level: 'medium',
      signals: ['high_value_transaction', 'new_shipping_address'],
      requiresReview: true,
    },
  })

  await new Promise(resolve => setTimeout(resolve, 100))
  logger.set({
    attempt: {
      number: 1,
      maxRetries: 3,
      processorLatency: 2340,
      timeout: false,
    },
  })

  throw createError({
    message: 'Payment processing failed',
    status: 402,
    why: 'Card declined by issuer - insufficient funds on corporate card',
    fix: 'Please use a different payment method or contact your finance department to increase the card limit',
    link: 'https://docs.example.com/payments/declined',
  })
})
