import type { DrainContext } from 'evlog'
import { defineEvlogHook } from 'evlog/eve'
import { createFsDrain } from 'evlog/fs'
import { createDrainPipeline } from 'evlog/pipeline'
import { environment } from '../lib/environment'

const drain = createDrainPipeline<DrainContext>({
  batch: { size: 5, intervalMs: 2000 },
})(createFsDrain())

export default defineEvlogHook({
  init: { env: { service: 'evi', environment: environment() } },
  drain,
  sessionEvent: true,
})
