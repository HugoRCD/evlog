import { billingErrors } from '~~/server/utils/errors'

/**
 * Demonstrates `tags` + `internal` defaults.
 * - `tags: ['fraud', 'manual-review']` are catalog metadata (not on the wire).
 * - `internal: { category: 'gateway', riskBand: 'high' }` is the catalog default;
 *    call-site `internal` shallow-merges over it (`category` wins from catalog,
 *    `mlScore` is added by the call-site).
 *
 * Inspect the terminal wide event for `error.internal` and the HTTP body
 * (browser devtools) to confirm `internal` never leaks to the client.
 */
export default defineEventHandler(() => {
  throw billingErrors.FRAUD_DETECTED({
    internal: { mlScore: 0.97, sessionId: 'sess_demo_x9' },
  })
})
