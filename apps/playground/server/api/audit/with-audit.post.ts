import { AuditDeniedError, withAudit } from 'evlog'

const refundInvoice = withAudit(
  {
    action: 'invoice.refund',
    target: ({ id }: { id: string }) => ({ type: 'invoice', id }),
  },
  ({ id }: { id: string }) => {
    if (id === 'inv_denied') throw new AuditDeniedError('Insufficient permissions to refund this invoice')
    if (id === 'inv_boom') throw new Error('Payment gateway exploded')
    return { id, status: 'refunded', amount: 9999 }
  },
)

export default defineEventHandler(async (event) => {
  const body = await readBody<{ scenario?: 'success' | 'failure' | 'denied' }>(event)
  const scenario = body?.scenario ?? 'success'

  const id
    = scenario === 'failure'
      ? 'inv_boom'
      : scenario === 'denied'
        ? 'inv_denied'
        : 'inv_889'

  try {
    const result = await refundInvoice({ id }, { actor: { type: 'user', id: 'usr_42' } })
    return { ok: true, scenario, result }
  } catch (err) {
    return { ok: false, scenario, error: (err as Error).message }
  }
})
