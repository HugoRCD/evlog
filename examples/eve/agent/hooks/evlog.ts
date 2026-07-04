import type { DrainContext } from 'evlog'
import { defineEvlogHook } from 'evlog/eve'
import { createFsDrain } from 'evlog/fs'
import { createDrainPipeline } from 'evlog/pipeline'

const batchedFsDrain = createDrainPipeline<DrainContext>({
  batch: { size: 5, intervalMs: 2000 },
})(createFsDrain())

export default defineEvlogHook({
  init: { env: { service: 'clearbill-support-agent' } },
  drain: batchedFsDrain,
  enrich: (ctx) => {
    ctx.event.runtime = process.env.VERCEL_REGION ?? 'local'
    ctx.event.demo = 'evlog-eve-support-refund'
  },
  keep: (ctx) => {
    const { context } = ctx
    const tools = (context.ai as { tools?: Array<{ success: boolean }> } | undefined)?.tools
    if (tools?.some(tool => !tool.success)) {
      ctx.shouldKeep = true
    }
    const refund = context.refund as { amount?: number } | undefined
    if ((refund?.amount ?? 0) > 100) {
      ctx.shouldKeep = true
    }
    if (context.audit) {
      ctx.shouldKeep = true
    }
  },
})
