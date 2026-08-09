import type { DrainContext } from 'evlog'
import { defineEvlogHook } from 'evlog/eve'
import { createFsDrain } from 'evlog/fs'
import { createDrainPipeline } from 'evlog/pipeline'
import { environment } from '../lib/environment'

/**
 * The fs drain only runs where the filesystem is writable. On Vercel
 * everything outside /tmp is read-only, so attaching it there errored on every
 * flush and persisted nothing; hosted environments run without a drain until a
 * hosted destination lands (EVL-256).
 */
const drain = process.env.VERCEL
  ? undefined
  : createDrainPipeline<DrainContext>({
      batch: { size: 5, intervalMs: 2000 },
    })(createFsDrain())

export default defineEvlogHook({
  init: { env: { service: 'evi', environment: environment() } },
  ...(drain ? { drain } : {}),
  sessionEvent: true,
})
