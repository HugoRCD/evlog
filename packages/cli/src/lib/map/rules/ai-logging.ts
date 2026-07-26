import { HANDLER_KINDS } from './types'
import type { MapRule } from './types'

/** AI SDK entry points whose cost and latency belong on the event. */
const AI_CALLS = ['generateText', 'streamText', 'generateObject', 'streamObject', 'embed', 'embedMany']

/**
 * This handler calls the AI SDK — is the model call on the event?
 *
 * Gated on the `ai` package being a dependency, so this only ever appears for
 * teams already building with it. Without `evlog/ai` the event records that the
 * request happened but not what the model cost, which is usually the most
 * expensive and most variable part of the request.
 */
export const aiLoggingRule = {
  id: 'ai-logging',
  category: 'opportunity',
  /* One wrapped model, shared by every handler that calls it. */
  scope: 'project',
  title: 'ai',
  expects: 'evlog/ai',
  question: 'Are model calls, tokens and latency on the event?',
  docs: '/use-cases/ai-sdk/overview',
  appliesTo: {
    kinds: HANDLER_KINDS,
    when: ({ project, facts }) => {
      if (!project.pairable.has('ai')) return false
      /* Project-wide, like `auth-identity`: the middleware is installed once on
         a shared model, and reading only this file would keep nagging every
         handler that calls that model. */
      if (project.features.has('ai')) return false
      return AI_CALLS.some(name => facts.callsTo(name).length > 0)
    },
  },

  suggest() {
    return [
      'import { createAIMiddleware } from \'evlog/ai\'',
      '',
      'const model = wrapLanguageModel({',
      '  model: openai(\'gpt-4o\'),',
      '  middleware: createAIMiddleware(log),',
      '})',
    ]
  },

  create(context) {
    const { facts } = context
    return {
      onEnd() {
        /* Source order, not the order of `AI_CALLS`: grouping by name first
           points the evidence at whichever helper happens to be listed first,
           which can sit well below the call the reader should look at. */
        const call = facts.calls.find(fact => AI_CALLS.includes(fact.member))
        context.report({
          message: 'AI SDK call without evlog/ai — tokens, cost and model latency are missing from the event',
          line: call?.line,
        })
      },
    }
  },
} satisfies MapRule
