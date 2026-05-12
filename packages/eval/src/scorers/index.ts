import type { GatewayModelId } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { Scorer, ScorerContext, ScoreResult } from '../types'

// ---------------------------------------------------------------------------
// defineScorer — factory compatible with Evalite's createScorer shape
// ---------------------------------------------------------------------------

/**
 * Create a named, reusable scorer.
 *
 * The returned scorer is compatible with Evalite's `createScorer` shape
 * and `autoevals` scorers — pass them directly to `createEval({ scorers })`.
 *
 * @example
 * ```ts
 * const myScorer = defineScorer({
 *   name: 'starts-with-capital',
 *   score: ({ output }) => /^[A-Z]/.test(String(output)),
 * })
 * ```
 */
export function defineScorer<TInput = unknown, TOutput = unknown>(
  options: Scorer<TInput, TOutput>,
): Scorer<TInput, TOutput> {
  return options
}

// ---------------------------------------------------------------------------
// Output scorers — evaluate the task's string output
// ---------------------------------------------------------------------------

/**
 * Passes when `output === expected` (strict equality).
 */
export const exactMatch: Scorer<string, string> = {
  name: 'exact-match',
  score: ({ output, expected }) => output === expected,
}

/**
 * Passes when `output` contains the given substring.
 */
export function contains(substring: string): Scorer<string, string> {
  return {
    name: `contains(${substring})`,
    score: ({ output }) => String(output).includes(substring),
  }
}

/**
 * Passes when `output` matches the given regular expression.
 */
export function matches(pattern: RegExp): Scorer<string, string> {
  return {
    name: `matches(${pattern.source})`,
    score: ({ output }) => pattern.test(String(output)),
  }
}

/**
 * Uses an LLM as a judge to score the output on a 0-1 scale.
 *
 * Requires `ai` SDK as a peer dependency.
 * The model receives a structured prompt and returns a numeric score.
 *
 * @example
 * ```ts
 * import { llmJudge } from '@evlog/eval'
 *
 * const judge = llmJudge({
 *   model: 'anthropic/claude-haiku-4',
 *   threshold: 0.7,
 * })
 * ```
 */
export function llmJudge(options: {
  model: LanguageModelV3 | GatewayModelId
  /**
   * Custom prompt. Receives the scorer context, must return a string
   * that instructs the judge to reply with a single number 0-1.
   */
  prompt?: (ctx: ScorerContext) => string
  threshold?: number
}): Scorer {
  return {
    name: 'llm-judge',
    threshold: options.threshold ?? 0.5,
    score: async (ctx) => {
      const { generateObject } = await import('ai')
      const { gateway } = await import('ai')
      const { z } = await import('zod')

      const model = typeof options.model === 'string' ? gateway(options.model) : options.model

      const defaultPrompt = `You are an impartial evaluator. Score the following AI output on a scale of 0.0 to 1.0.

Input:
${JSON.stringify(ctx.input, null, 2)}

Expected:
${ctx.expected !== undefined ? JSON.stringify(ctx.expected, null, 2) : '(no reference provided)'}

Actual output:
${JSON.stringify(ctx.output, null, 2)}

Return a score between 0.0 (completely wrong) and 1.0 (perfect).`

      const prompt = options.prompt ? options.prompt(ctx) : defaultPrompt

      const { object } = await generateObject({
        model,
        schema: z.object({
          score: z.number().min(0).max(1),
          reasoning: z.string().optional(),
        }),
        prompt,
      })

      return {
        score: object.score,
        metadata: object.reasoning ? { reasoning: object.reasoning } : undefined,
      } as ScoreResult
    },
  }
}

/**
 * Passes when `output` is not empty (after trimming whitespace).
 */
export const notEmpty: Scorer<string, string> = {
  name: 'not-empty',
  score: ({ output }) => String(output).trim().length > 0,
}

/**
 * Passes when `output` length is within the given range.
 */
export function lengthBetween(min: number, max: number): Scorer<string, string> {
  return {
    name: `length-between(${min},${max})`,
    score: ({ output }) => {
      const len = String(output).length
      return { score: len >= min && len <= max, metadata: { length: len, min, max } }
    },
  }
}
