import type { DrainContext } from 'evlog'
import { createRequestLogger, initLogger, log } from 'evlog'
import { createAxiomDrain } from 'evlog/axiom'
import { createDrainPipeline } from 'evlog/pipeline'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// --- Setup: pipeline (batching + retry) → Axiom adapter → initLogger ---

const pipeline = createDrainPipeline<DrainContext>({ batch: { size: 10, intervalMs: 2000 } })
const drain = pipeline(createAxiomDrain())

initLogger({
  env: { service: 'order-sync', environment: 'production' },
  pretty: true,
  drain,
})

// --- Simulate a real batch processing script ---

const orders = [
  { id: 'ord_1a2b', customer: 'alice@example.com', total: 59.99, items: 3 },
  { id: 'ord_3c4d', customer: 'bob@example.com', total: 124.50, items: 7 },
  { id: 'ord_5e6f', customer: 'charlie@example.com', total: 12.00, items: 1 },
]

log.info({ action: 'sync_started', orderCount: orders.length })

for (const order of orders) {
  const reqLog = createRequestLogger({ method: 'POST', path: '/sync/order' })
  reqLog.set({ orderId: order.id, customer: order.customer })

  // Simulate fetching order details from external API
  await sleep(800)
  reqLog.set({ total: order.total, items: order.items })

  // Simulate a random failure for one order
  if (order.total > 100) {
    reqLog.error(new Error('Payment verification timeout'), { gateway: 'stripe' })
    reqLog.set({ status: 500 })
    reqLog.emit()

    log.warn({ action: 'order_skipped', orderId: order.id, reason: 'payment_timeout' })
    await sleep(500)
    continue
  }

  // Simulate syncing to warehouse
  await sleep(600)
  reqLog.set({ status: 200, warehouse: 'eu-west-1', synced: true })
  reqLog.emit()
}

log.info({ action: 'sync_completed', synced: 2, failed: 1 })

// Flush remaining buffered events before exit
await drain.flush()
