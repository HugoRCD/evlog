/**
 * @evlog/eval — AI eval runner
 *
 * Dataset + task + scorers, drained as structured wide events.
 *
 * @example
 * ```ts
 * import { createEval, exactMatch, llmJudge } from '@evlog/eval'
 * import { maxSteps, noToolLoop } from '@evlog/eval/ai-scorers'
 * import { braintrustDrain, jsonlDrain } from '@evlog/eval/drains'
 * import { generateText } from 'ai'
 *
 * const myEval = createEval({
 *   name: 'summarization-quality',
 *   dataset: [{ id: 'c1', input: 'Long article...', expected: 'Short summary.' }],
 *   task: async (input, { ai }) => {
 *     const model = ai.wrap('anthropic/claude-haiku-4')
 *     const { text } = await generateText({ model, prompt: `Summarize: ${input}` })
 *     return text
 *   },
 *   scorers: [exactMatch, llmJudge({ model: 'anthropic/claude-haiku-4' })],
 *   drain: [braintrustDrain({ apiKey: '...', projectName: 'my-app' }), jsonlDrain()],
 *   concurrency: 10,
 *   trialCount: 3,
 *   threshold: 0.8,
 * })
 *
 * const results = await myEval.run()
 * if (!results.passed) process.exit(1)
 * ```
 */

export { createEval } from './runner'

export {
  defineScorer,
  exactMatch,
  contains,
  matches,
  llmJudge,
  notEmpty,
  lengthBetween,
} from './scorers/index'

export type {
  EvalCase,
  EvalOptions,
  EvalResults,
  EvalCaseResult,
  EvalSuite,
  EvalTaskContext,
  Scorer,
  ScorerContext,
  ScoreResult,
  SummaryScorer,
  TrialResult,
  DrainFn,
  AIEventData,
} from './types'
