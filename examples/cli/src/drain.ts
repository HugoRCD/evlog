import type { DrainContext } from 'evlog'
import { createAxiomDrain } from 'evlog/axiom'
import { createDatadogDrain } from 'evlog/datadog'
import { createFsDrain } from 'evlog/fs'
import { createOtlpDrain } from 'evlog/otlp'
import { createDrainPipeline } from 'evlog/pipeline'

const pipeline = createDrainPipeline<DrainContext>({
  batch: { size: 5, intervalMs: 1000 },
})

/**
 * Resolve the drain at runtime.
 *
 * Packaged CLIs must not embed provider tokens — read env on the machine that
 * runs the binary. Default `fs` works offline with zero credentials.
 *
 * @see examples/cli/.env.example
 * @see https://evlog.dev/integrate/frameworks/cli#send-events-to-axiom-or-another-provider
 */
export function createCliDrain() {
  switch (process.env.EVLOG_DRAIN ?? 'fs') {
    case 'axiom':
      // Reads AXIOM_API_KEY / AXIOM_DATASET (or AXIOM_TOKEN) from the environment
      return pipeline(createAxiomDrain())
    case 'datadog':
      return pipeline(createDatadogDrain())
    case 'otlp':
      return pipeline(createOtlpDrain())
    default:
      return pipeline(createFsDrain({
        dir: process.env.EVLOG_LOG_DIR ?? '.evlog/logs',
      }))
  }
}
