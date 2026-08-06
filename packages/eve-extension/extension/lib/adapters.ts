import type { DrainContext } from 'evlog'
import { createAxiomDrain } from 'evlog/axiom'
import { createBetterStackDrain } from 'evlog/better-stack'
import { createClickHouseDrain } from 'evlog/clickhouse'
import { createDatadogDrain } from 'evlog/datadog'
import { createFsDrain } from 'evlog/fs'
import { createHyperDXDrain } from 'evlog/hyperdx'
import { createLokiDrain } from 'evlog/loki'
import { createMemoryDrain } from 'evlog/memory'
import { createOTLPDrain } from 'evlog/otlp'
import { createPostHogDrain } from 'evlog/posthog'
import { createSentryDrain } from 'evlog/sentry'
import { createDrainPipeline } from 'evlog/pipeline'
import type { ADAPTER_NAMES } from '../extension'

type AdapterName = (typeof ADAPTER_NAMES)[number]
/** Adapters accept a single context or a batch, which is what lets them sit behind a pipeline. */
type AdapterDrain = (ctx: DrainContext | DrainContext[]) => void | Promise<void>
/** What `BaseEvlogOptions.drain` expects: one event at a time. */
type HookDrain = (ctx: DrainContext) => void | Promise<void>
type DrainFactory = (overrides?: Record<string, unknown>) => AdapterDrain

/**
 * Every adapter factory reads its own env vars, so a bare name is enough for
 * the common case and `options` only overrides what the environment cannot.
 */
const FACTORIES: Record<AdapterName, DrainFactory> = {
  'axiom': createAxiomDrain as DrainFactory,
  'better-stack': createBetterStackDrain as DrainFactory,
  'clickhouse': createClickHouseDrain as DrainFactory,
  'datadog': createDatadogDrain as DrainFactory,
  'fs': createFsDrain as DrainFactory,
  'hyperdx': createHyperDXDrain as DrainFactory,
  'loki': createLokiDrain as DrainFactory,
  'memory': createMemoryDrain as DrainFactory,
  'otlp': createOTLPDrain as DrainFactory,
  'posthog': createPostHogDrain as DrainFactory,
  'sentry': createSentryDrain as DrainFactory,
}

export type AdapterConfig =
  | AdapterName
  | { type: AdapterName, options?: Record<string, unknown> }

export interface ResolveDrainOptions {
  adapter: AdapterConfig | AdapterConfig[]
  batch?: { size: number, intervalMs: number }
}

function createDrain(config: AdapterConfig): AdapterDrain {
  const { type, options } = typeof config === 'string' ? { type: config, options: undefined } : config
  return FACTORIES[type](options)
}

/** Each destination runs independently so a failing one cannot starve the others. */
async function fanOut(
  drains: AdapterDrain[],
  payload: DrainContext | DrainContext[],
): Promise<void> {
  await Promise.all(drains.map(async (send) => {
    try {
      await send(payload)
    } catch (err) {
      console.error('[evlog] eve extension drain failed:', err)
    }
  }))
}

/**
 * Build the single drain the hook receives. With `batch`, the adapters sit
 * behind a pipeline that buffers events and hands them over as an array —
 * which every evlog adapter accepts.
 */
export function resolveDrain(options: ResolveDrainOptions): HookDrain {
  const configs = Array.isArray(options.adapter) ? options.adapter : [options.adapter]
  const drains = configs.map(createDrain)

  if (options.batch) {
    return createDrainPipeline<DrainContext>({ batch: options.batch })(
      (batch: DrainContext[]) => fanOut(drains, batch),
    )
  }
  return (ctx: DrainContext) => fanOut(drains, ctx)
}
