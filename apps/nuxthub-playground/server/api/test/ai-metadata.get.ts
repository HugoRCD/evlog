import { generateText } from 'ai'
import type { AIMetadata } from 'evlog/ai'
import { createAILogger } from 'evlog/ai'

/**
 * Demonstrates the public AI metadata API:
 * - `ai.onUpdate(cb)` to collect snapshots as the run progresses
 * - `ai.getMetadata()` to read the final structured snapshot
 * - `ai.getEstimatedCost()` to read the dollar cost
 *
 * The handler also writes the captured metadata back into the wide event
 * via `logger.set` so it shows up in the LogViewer alongside the response.
 */
export default defineEventHandler(async (event) => {
  const logger = useLogger(event)
  logger.set({ action: 'test-ai-metadata' })

  const ai = createAILogger(logger, {
    cost: {
      'gemini-3-flash': { input: 0.1, output: 0.4 },
    },
  })

  const history: Array<{ step: number, totalTokens: number, estimatedCost: number | undefined }> = []

  const off = ai.onUpdate((metadata: AIMetadata) => {
    history.push({
      step: metadata.calls,
      totalTokens: metadata.totalTokens,
      estimatedCost: metadata.estimatedCost,
    })
  })

  try {
    const result = await generateText({
      model: ai.wrap('google/gemini-3-flash'),
      prompt: 'In one short sentence, explain what observability means.',
      maxOutputTokens: 1000,
    })

    const metadata = ai.getMetadata()
    const estimatedCost = ai.getEstimatedCost()

    logger.set({
      aiPublicApi: {
        snapshotCalls: metadata.calls,
        snapshotTokens: metadata.totalTokens,
        snapshotCost: estimatedCost,
        updatesReceived: history.length,
      },
    })

    return {
      status: 'ok',
      text: result.text,
      metadata,
      estimatedCost,
      history,
    }
  } finally {
    off()
  }
})
