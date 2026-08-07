import type { DrainContext } from 'evlog'
import { defineEvlogHook } from 'evlog/eve'
import { createFsDrain } from 'evlog/fs'
import { createDrainPipeline } from 'evlog/pipeline'
import { environment, hasDurableDisk } from '../lib/environment'

const drain = hasDurableDisk()
  ? createDrainPipeline<DrainContext>({ batch: { size: 5, intervalMs: 2000 } })(createFsDrain())
  : undefined

export default defineEvlogHook({
  init: {
    env: {
      service: 'evi',
      environment: environment(),
    },
  },
  ...(drain ? { drain } : {}),
  sessionEvent: true,
})
