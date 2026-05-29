import { defineAuditCatalog } from 'evlog'

/**
 * Bundled audit catalog for the billing domain.
 *
 * Each entry produces a thin wrapper around `defineAuditAction`:
 * the wire `action` is `${prefix}.${UPPER_KEY}` (e.g. `billing.INVOICE_REFUND`)
 * and the `target.type` is auto-injected when set on the catalog entry.
 */
export const billingAudit = defineAuditCatalog('billing', {
  INVOICE_REFUND: {
    target: 'invoice',
    severity: 'high',
    requiresChanges: true,
    description: 'Refund an invoice to the customer',
    redactPaths: ['cardNumber', 'cvv'],
  },
  INVOICE_CREATE: { target: 'invoice', severity: 'medium' },
  INVOICE_VOID: { target: 'invoice', severity: 'high', requiresReason: true },
  SUBSCRIPTION_CANCEL: { target: 'subscription', severity: 'high' },
  /**
   * No `target` set → call sites can pass any target shape (or none).
   */
  PASSWORD_CHANGE: { severity: 'high', requiresChanges: true, redactPaths: ['password'] },
})

/**
 * Opt-in module augmentation — surfaces the union of all registered audit
 * actions on the typed `AuditAction` export and any helper that consumes it.
 */
declare module 'evlog' {
  interface RegisteredAuditCatalogs {
    billing: typeof billingAudit
  }
}
