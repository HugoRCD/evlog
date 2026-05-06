import { createError } from 'evlog'
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
  createError({
    code: 'billing.PAYMENT_DECLINED',
    message: 'Payment failed',
    status: 402,
    why: 'Card declined by issuer (insufficient funds on corporate card)',
    fix: 'Use a different payment method or contact your finance department',
    link: 'https://docs.example.com/errors/billing.payment_declined',
  })
})
