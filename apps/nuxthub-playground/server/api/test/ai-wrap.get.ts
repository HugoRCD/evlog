import { gateway, generateText, wrapLanguageModel } from 'ai'
import type { LanguageModelV3Middleware } from '@ai-sdk/provider'
import { createAILogger } from 'evlog/ai'

/**
 * Simulates an external middleware (supermemory, guardrails, etc.)
 * that injects a system message — proves the middleware actually ran in the chain.
 */
const externalMiddleware: LanguageModelV3Middleware = {
  specificationVersion: 'v3',
  transformParams({ params }) {
    return Promise.resolve({
      ...params,
      prompt: [
        { role: 'system' as const, content: 'Always start your answer with "MIDDLEWARE_OK:"' },
        ...params.prompt,
      ],
    })
  },
}

export default defineEventHandler(async (event) => {
  const logger = useLogger(event)
  logger.set({ action: 'test-ai-wrap-composition' })

  const ai = createAILogger(logger, { toolInputs: true })

  const base = gateway('google/gemini-3-flash')
  const preWrapped = wrapLanguageModel({ model: base, middleware: externalMiddleware })
  const model = ai.wrap(preWrapped)

  const result = await generateText({
    model,
    prompt: 'Say hello.',
    maxOutputTokens: 200,
  })

  const middlewareRan = result.text.startsWith('MIDDLEWARE_OK:')

  return {
    status: 'ok',
    middlewareRan,
    text: result.text,
  }
})
