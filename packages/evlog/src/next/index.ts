import type { NextEvlogOptions } from './types'
import { createWithEvlog } from './handler'
import { useLogger } from './storage'
import { log } from '../logger'
import { createError, createEvlogError } from '../error'

export type { NextEvlogOptions, EvlogMiddlewareConfig } from './types'

export { evlogMiddleware } from './middleware'
export { useLogger } from './storage'
export { log } from '../logger'
export { createError, createEvlogError } from '../error'

/**
 * Create an evlog instance configured for Next.js.
 * Returns all helpers needed for server-side logging.
 *
 * @example
 * ```ts
 * // lib/evlog.ts
 * import { createEvlog } from 'evlog/next'
 * import { createAxiomDrain } from 'evlog/axiom'
 * import { createDrainPipeline } from 'evlog/pipeline'
 *
 * const pipeline = createDrainPipeline({ batch: { size: 50 } })
 *
 * export const { withEvlog, useLogger, log, createEvlogError } = createEvlog({
 *   service: 'my-app',
 *   sampling: {
 *     rates: { info: 10 },
 *     keep: [{ status: 400 }, { duration: 1000 }],
 *   },
 *   drain: pipeline(createAxiomDrain({
 *     dataset: 'logs',
 *     token: process.env.AXIOM_TOKEN!,
 *   })),
 *   enrich: (ctx) => {
 *     ctx.event.deploymentId = process.env.VERCEL_DEPLOYMENT_ID
 *   },
 * })
 * ```
 */
export function createEvlog(options: NextEvlogOptions = {}) {
  const withEvlog = createWithEvlog(options)

  return {
    withEvlog,
    useLogger,
    log,
    createError,
    createEvlogError,
  }
}
