import { billingErrors } from '~~/server/utils/errors'

/**
 * Templated message — params are required and typed at the call site.
 * Returned wire `message` is interpolated server-side.
 */
export default defineEventHandler(() => {
  throw billingErrors.INSUFFICIENT_FUNDS({
    available: 12,
    required: 99,
    currency: 'USD',
  })
})
