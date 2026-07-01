import { defineTool } from 'eve/tools'
import { useTurnLogger } from 'evlog/eve'
import { z } from 'zod'
import { findOrder } from '../lib/support-data.js'
import { fakeLatency } from '../lib/fake-latency.js'

/** Refunds above this amount require human approval in the demo. */
export const REFUND_APPROVAL_THRESHOLD_USD = 100

export default defineTool({
  description: 'Issue a refund on a paid Clearbill order. Amounts over $100 require human approval.',
  inputSchema: z.object({
    orderId: z.string(),
    reason: z.string().describe('Why the customer is getting a refund'),
  }),
  needsApproval: ({ toolInput }) => {
    const order = findOrder(String(toolInput?.orderId ?? ''))
    return (order?.amount ?? 0) > REFUND_APPROVAL_THRESHOLD_USD
  },
  async execute({ orderId, reason }, ctx) {
    await fakeLatency(900, 1600)

    const order = findOrder(orderId)
    if (!order) {
      return { ok: false, error: 'order_not_found', orderId }
    }
    if (order.status === 'refunded') {
      return { ok: false, error: 'already_refunded', orderId }
    }

    const log = useTurnLogger(ctx)
    log.set({
      refund: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        reason,
        requiresApproval: order.amount > REFUND_APPROVAL_THRESHOLD_USD,
      },
    })
    log.audit({
      action: 'refund.issued',
      actor: { type: 'agent', id: 'clearbill-support-copilot' },
      target: { type: 'order', id: order.id },
      reason,
    })

    return {
      ok: true,
      refundId: `rfnd_${order.id}`,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: 'refunded',
    }
  },
})
