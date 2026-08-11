import type { DrainContext } from 'evlog'
import type { DrainPipelineOptions } from 'evlog/pipeline'
import { createDrainPipeline } from 'evlog/pipeline'

type Destination = (batch: DrainContext[]) => void | Promise<void>

/**
 * Fan one wide event out to several destinations, each with its own pipeline
 * so a rejected send is retried against that destination alone.
 *
 * Returns `undefined` when there is no destination.
 */
export function createFanOutDrain(
  destinations: readonly Destination[],
  options?: DrainPipelineOptions<DrainContext>,
): ((ctx: DrainContext) => void) | undefined {
  if (destinations.length === 0) return undefined

  const pipelines = destinations.map(destination =>
    createDrainPipeline<DrainContext>(options)(destination),
  )

  return (ctx) => {
    for (const pipeline of pipelines) pipeline(ctx)
  }
}
