import { defineError, defineErrorCatalog } from 'evlog'

/**
 * Bundled error catalog for the billing domain.
 *
 * Demonstrates every supported entry shape:
 * - constant `message` + full context fields (`why`, `fix`, `link`)
 * - templated `message: (params) => string` with required typed call-site params
 * - `tags` and `internal` defaults (call-site `internal` shallow-merges over these)
 *
 * Wire codes are derived as `${prefix}.${UPPER_KEY}`, e.g. `billing.PAYMENT_DECLINED`.
 */
export const billingErrors = defineErrorCatalog('billing', {
  PAYMENT_DECLINED: {
    status: 402,
    message: 'Payment failed',
    why: 'Card declined by issuer (insufficient funds on corporate card)',
    fix: 'Use a different payment method or contact your finance department',
    link: 'https://docs.example.com/errors/billing.payment_declined',
  },

  INSUFFICIENT_FUNDS: {
    status: 402,
    message: ({ available, required, currency }: { available: number, required: number, currency: string }) =>
      `Insufficient funds: ${currency} ${available} available, ${currency} ${required} required`,
    why: 'Account balance is below charge amount',
    fix: 'Add funds to your account and retry',
    link: 'https://docs.example.com/errors/billing.insufficient_funds',
  },

  FRAUD_DETECTED: {
    status: 403,
    message: 'Transaction flagged for review',
    why: 'ML fraud-score above threshold (0.95)',
    fix: 'Contact support to verify your identity',
    link: 'https://docs.example.com/errors/billing.fraud_detected',
    tags: ['fraud', 'manual-review'],
    internal: { category: 'gateway', riskBand: 'high' },
  },

  CART_EMPTY: {
    status: 400,
    message: 'Cart is empty',
  },
})

/**
 * Standalone factory created with `defineError` — same shape as a catalog
 * entry, no prefix derivation. Use this pattern for one-off errors that do
 * not belong to any bundle, or for very large repos that prefer one factory
 * per file (mirrors `defineAuditAction`).
 */
export const rateLimited = defineError('app.RATE_LIMITED', {
  status: 429,
  message: ({ retryAfter }: { retryAfter: number }) =>
    `Rate limited: retry in ${retryAfter}s`,
  why: 'Per-IP request budget exceeded',
  fix: 'Wait for the cooldown then retry',
  link: 'https://docs.example.com/errors/app.rate_limited',
  tags: ['rate-limit'],
})

/**
 * Opt-in module augmentation. With this in place:
 * - `createError({ code })` autocompletes `'billing.PAYMENT_DECLINED' | 'billing.INSUFFICIENT_FUNDS' | ...`
 * - `parseError(err).code` is typed as the same union (still accepts ad-hoc strings via `(string & {})`)
 * - any other typed `code` field across the codebase surfaces the same union
 *
 * This is purely type-level — no runtime registration, no init step.
 */
declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    billing: typeof billingErrors
    app: { readonly _codes: readonly [typeof rateLimited.code] }
  }
}
