import type { AIEventData } from 'evlog/ai'
import type { WideEvent } from 'evlog'
import type { Scorer } from '../types'
import { defineScorer } from './index'

/**
 * Extract the typed `AIEventData` from a wide event.
 *
 * Use this in custom AI scorers to access `ai.*` telemetry fields without
 * needing to cast `event.ai` manually:
 *
 * ```ts
 * import { defineScorer } from '@evlog/eval'
 * import { getEventAI } from '@evlog/eval/ai-scorers'
 *
 * const mustUseTools = defineScorer({
 *   name: 'must-use-tools',
 *   score: ({ event }) => {
 *     const ai = getEventAI(event)
 *     return (ai?.toolCalls?.length ?? 0) > 0
 *   },
 * })
 * ```
 */
export function getEventAI(event: Readonly<WideEvent>): AIEventData | undefined {
  return (event as Record<string, unknown>).ai as AIEventData | undefined
}

function getAI(event: Readonly<WideEvent>): AIEventData | undefined {
  return getEventAI(event)
}

/**
 * AI-aware scorers that evaluate the AI telemetry captured by `createAILogger`.
 *
 * These scorers access `ctx.event.ai.*` — fields automatically populated by
 * the pre-wired `AILogger` in every `EvalTaskContext`. No extra instrumentation
 * needed: if the task calls `ai.wrap(model)`, all telemetry is captured.
 *
 * Import from `@evlog/eval/ai-scorers`:
 * ```ts
 * import { maxSteps, noToolLoop, minCacheHitRate } from '@evlog/eval/ai-scorers'
 * ```
 *
 * These scorers solve the class of problems described in GitHub's agentic
 * workflow efficiency research — detecting runaway tool loops, measuring
 * cache efficiency, constraining cost and latency per case.
 */

// ---------------------------------------------------------------------------
// Step / call count scorers
// ---------------------------------------------------------------------------

/**
 * Passes when the number of agent LLM steps does not exceed `n`.
 *
 * Detects runaway loops where an agent uses far more steps than expected
 * (e.g. a normal 4-turn triage taking 18 turns due to misconfiguration).
 *
 * @example maxSteps(8) — fail if agent uses more than 8 LLM steps
 */
export function maxSteps(n: number): Scorer {
  return defineScorer({
    name: `max-steps(${n})`,
    score: ({ event }) => {
      const steps = getAI(event)?.steps ?? 1
      return { score: steps <= n, metadata: { steps, limit: n } }
    },
  })
}

/**
 * Passes when the total number of LLM API calls does not exceed `n`.
 *
 * Distinct from `maxSteps` when a single agent step makes multiple calls.
 *
 * @example maxCalls(10)
 */
export function maxCalls(n: number): Scorer {
  return defineScorer({
    name: `max-calls(${n})`,
    score: ({ event }) => {
      const calls = getAI(event)?.calls ?? 0
      return { score: calls <= n, metadata: { calls, limit: n } }
    },
  })
}

// ---------------------------------------------------------------------------
// Tool call scorers
// ---------------------------------------------------------------------------

/**
 * Passes when a specific tool is called no more than `max` times.
 *
 * Detects pathological tool usage like `search_repositories` being called
 * 342 times in a single run when it shouldn't have been called at all.
 *
 * @example maxToolCallFrequency('search_repositories', 3)
 */
export function maxToolCallFrequency(tool: string, max: number): Scorer {
  return defineScorer({
    name: `max-tool-call-frequency(${tool},${max})`,
    score: ({ event }) => {
      const calls = getAI(event)?.toolCalls
      if (!calls || calls.length === 0) return { score: true, metadata: { count: 0, tool, limit: max } }
      const names = calls.map(c => (typeof c === 'string' ? c : (c as { name: string }).name))
      const count = names.filter(n => n === tool).length
      return { score: count <= max, metadata: { count, tool, limit: max } }
    },
  })
}

/**
 * Detects tool call loops — when any single tool is called `threshold` or
 * more times consecutively or in aggregate during a single case run.
 *
 * Catches the case where an agent falls into a fallback loop (e.g. manually
 * re-reading source files 64 times after a tool fails to load).
 *
 * @param threshold Default 10 — any tool called ≥ 10 times triggers a failure.
 *
 * @example noToolLoop() — default threshold 10
 * @example noToolLoop(5) — stricter, any tool called ≥ 5 times fails
 */
export function noToolLoop(threshold = 10): Scorer {
  return defineScorer({
    name: `no-tool-loop(${threshold})`,
    score: ({ event }) => {
      const calls = getAI(event)?.toolCalls
      if (!calls || calls.length === 0) return { score: true, metadata: { maxFreq: 0, threshold } }

      const names = calls.map(c => (typeof c === 'string' ? c : (c as { name: string }).name))
      const freq: Record<string, number> = {}
      for (const name of names) freq[name] = (freq[name] ?? 0) + 1

      const entries = Object.entries(freq)
      const [loopingTool, maxFreq] = entries.reduce<[string, number]>(
        ([bestTool, bestCount], [tool, count]) =>
          count > bestCount ? [tool, count] : [bestTool, bestCount],
        ['', 0],
      )

      return {
        score: maxFreq < threshold,
        metadata: { maxFreq, loopingTool: maxFreq > 0 ? loopingTool : undefined, threshold, allFreqs: freq },
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Token efficiency scorers
// ---------------------------------------------------------------------------

/**
 * Passes when the cache hit rate (cacheReadTokens / inputTokens) meets
 * the minimum `rate`. Encourages effective prompt caching.
 *
 * Cache-read tokens cost ~10× less than fresh input tokens across all
 * major providers — a low hit rate signals wasted spend.
 *
 * @param rate Minimum ratio (0-1). E.g. `0.2` = at least 20% cache hits.
 *
 * @example minCacheHitRate(0.3)
 */
export function minCacheHitRate(rate: number): Scorer {
  return defineScorer({
    name: `min-cache-hit-rate(${rate})`,
    score: ({ event }) => {
      const ai = getAI(event)
      const cacheRead = ai?.cacheReadTokens ?? 0
      const input = ai?.inputTokens ?? 0
      const hitRate = input > 0 ? cacheRead / input : 0
      return {
        score: hitRate >= rate,
        metadata: { hitRate: Math.round(hitRate * 1000) / 1000, cacheReadTokens: cacheRead, inputTokens: input, target: rate },
      }
    },
  })
}

/**
 * Passes when the average tokens consumed per agent step does not exceed `n`.
 *
 * High tokens-per-step indicates the agent is re-reading large contexts or
 * making inefficient tool calls on each turn.
 *
 * @example maxTokensPerStep(2000)
 */
export function maxTokensPerStep(n: number): Scorer {
  return defineScorer({
    name: `max-tokens-per-step(${n})`,
    score: ({ event }) => {
      const ai = getAI(event)
      const total = ai?.totalTokens ?? 0
      const steps = ai?.steps ?? 1
      const perStep = steps > 0 ? Math.round(total / steps) : total
      return { score: perStep <= n, metadata: { perStep, total, steps, limit: n } }
    },
  })
}

// ---------------------------------------------------------------------------
// Finish reason scorer
// ---------------------------------------------------------------------------

/**
 * Passes when the LLM finished with reason `'stop'` (clean completion).
 *
 * Failures indicate the model was interrupted (`max-tokens`, `error`) or
 * is waiting for more tool results (`tool-calls`) — all signs of a
 * misconfigured or looping agent.
 */
export const finishesCleanly: Scorer = defineScorer({
  name: 'finishes-cleanly',
  score: ({ event }) => {
    const reason = getAI(event)?.finishReason
    return {
      score: reason === 'stop',
      metadata: { finishReason: reason ?? 'unknown' },
    }
  },
})

// ---------------------------------------------------------------------------
// Cost and latency scorers
// ---------------------------------------------------------------------------

/**
 * Passes when the estimated cost per case does not exceed `dollars`.
 *
 * Requires `aiOptions.cost` to be set on `createEval` — otherwise
 * `estimatedCost` is undefined and the scorer always passes.
 *
 * @example maxCost(0.01) — fail if a single case costs more than $0.01
 */
export function maxCost(dollars: number): Scorer {
  return defineScorer({
    name: `max-cost($${dollars})`,
    score: ({ event }) => {
      const cost = getAI(event)?.estimatedCost
      if (cost === undefined) return { score: true, metadata: { note: 'estimatedCost not available — set aiOptions.cost' } }
      return { score: cost <= dollars, metadata: { cost, limit: dollars } }
    },
  })
}

/**
 * Passes when the total wall-clock duration for the case does not exceed `ms`.
 *
 * Uses `ai.totalDurationMs` when the `createEvlogIntegration` telemetry
 * integration is active, otherwise falls back to `ai.msToFinish`.
 *
 * @example maxLatency(3000) — fail if a case takes more than 3 seconds
 */
export function maxLatency(ms: number): Scorer {
  return defineScorer({
    name: `max-latency(${ms}ms)`,
    score: ({ event }) => {
      const ai = getAI(event)
      const duration = ai?.totalDurationMs ?? ai?.msToFinish
      if (duration === undefined) return { score: true, metadata: { note: 'duration not captured' } }
      return { score: duration <= ms, metadata: { durationMs: duration, limit: ms } }
    },
  })
}

/**
 * Passes when the streaming throughput meets the minimum `tokensPerSecond`.
 *
 * Only meaningful for streaming tasks — `tokensPerSecond` is only populated
 * when the task uses `streamText`.
 *
 * @example minThroughput(50) — at least 50 tokens/s
 */
export function minThroughput(tokensPerSecond: number): Scorer {
  return defineScorer({
    name: `min-throughput(${tokensPerSecond}t/s)`,
    score: ({ event }) => {
      const tps = getAI(event)?.tokensPerSecond
      if (tps === undefined) return { score: true, metadata: { note: 'tokensPerSecond not available (non-streaming task)' } }
      return { score: tps >= tokensPerSecond, metadata: { tokensPerSecond: tps, limit: tokensPerSecond } }
    },
  })
}
