import { billingErrors } from '~~/server/utils/errors'

/**
 * Throws a catalog error with all defaults applied (no overrides).
 * Wire shape:
 *   - status: 402
 *   - message: 'Payment failed'
 *   - data.code: 'billing.PAYMENT_DECLINED'
 *   - data.why / data.fix / data.link: from the catalog entry
 */
export default defineEventHandler(() => {
  throw billingErrors.PAYMENT_DECLINED({
    cause: new Error('stripe: card_declined (issuer code 05)'),
    internal: { stripeRef: 'ch_demo_x123', userId: 'usr_demo_42' },
  })
})
