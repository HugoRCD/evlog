import type { AIEventData, AILogger, AILoggerOptions } from 'evlog/ai'
import type { DrainContext, RequestLogger, WideEvent } from 'evlog'

export type { AIEventData }

/**
 * A single eval test case.
 */
export interface EvalCase<TInput = unknown, TOutput = unknown> {
  /** Optional stable identifier — auto-generated if absent. */
  id?: string
  input: TInput
  expected?: TOutput
  /** Extra metadata attached to the wide event under `eval.meta`. */
  meta?: Record<string, unknown>
}

/**
 * Context passed to the `task` function for each eval case.
 *
 * Fully decoupled from HTTP — `log` is a standalone `createLogger` instance
 * and `ai` is a pre-wired `createAILogger(log)` for automatic AI telemetry.
 */
export interface EvalTaskContext {
  /** Standalone evlog logger scoped to this eval case. */
  log: RequestLogger
  /** Pre-wired AI logger — wraps any model via `ai.wrap(model)`. */
  ai: AILogger
  /** The eval case being processed. */
  case: EvalCase
  /** 0-based trial index when `trialCount > 1`. */
  trialIndex: number
}

/**
 * The raw score value returned by a scorer's `score` function.
 *
 * Compatible with Evalite and autoevals scorer shapes.
 */
export type ScoreResult =
  | number
  | boolean
  | { score: number | boolean; metadata?: Record<string, unknown> }

/**
 * Context passed to each scorer.
 *
 * `event` is the finalized `WideEvent` for the case — `event.ai.*` fields
 * are already populated by `createAILogger`, enabling scorers that test
 * token usage, tool call frequency, latency, cost, etc.
 */
export interface ScorerContext<TInput = unknown, TOutput = unknown> {
  input: TInput
  output: TOutput
  expected?: TOutput
  /** The finalized wide event. Access `event.ai.*` for AI telemetry fields. */
  event: Readonly<WideEvent>
}

/**
 * A scorer evaluates a single eval case result.
 *
 * Return a number 0-1, a boolean, or `{ score, metadata }` for rich output.
 * Compatible with Evalite's `createScorer` shape and `autoevals` scorers.
 */
export interface Scorer<TInput = unknown, TOutput = unknown> {
  name: string
  /**
   * Minimum score to consider a case as passing.
   * - For boolean scores: ignored (true = pass, false = fail).
   * - For numeric scores: `score >= threshold` to pass.
   * @default 0.5
   */
  threshold?: number
  score: (ctx: ScorerContext<TInput, TOutput>) => ScoreResult | Promise<ScoreResult>
}

/**
 * A summary scorer runs after all cases are complete and receives
 * the full set of results — useful for dataset-level metrics.
 */
export interface SummaryScorer {
  name: string
  score: (cases: EvalCaseResult[]) => ScoreResult | Promise<ScoreResult>
}

/**
 * Options for `createEval`.
 */
export interface EvalOptions<TInput = unknown, TOutput = unknown> {
  /** Name of the eval suite. Used as the `eval.name` field on every wide event. */
  name: string
  /**
   * Dataset: an array, async iterable, or async factory function of eval cases.
   */
  dataset:
    | EvalCase<TInput, TOutput>[]
    | AsyncIterable<EvalCase<TInput, TOutput>>
    | (() => Promise<EvalCase<TInput, TOutput>[]>)
  /**
   * The function under evaluation. Receives the case `input` and an
   * `EvalTaskContext` with a scoped logger and AI logger.
   */
  task: (input: TInput, ctx: EvalTaskContext) => TOutput | Promise<TOutput>
  /** Per-case scorers. Run after each case completes. */
  scorers?: Scorer<TInput, TOutput>[]
  /** Post-run scorers that see the full set of results. */
  summaryScorers?: SummaryScorer[]
  /**
   * One or more drain functions. Each wide event is sent to all drains
   * in parallel — combine `braintrustDrain`, `axiomDrain`, `jsonlDrain`, etc.
   */
  drain?: DrainFn | DrainFn[]
  /** Maximum number of cases running in parallel. @default 5 */
  concurrency?: number
  /**
   * Number of times to run each case. Scores are averaged across trials.
   * Useful for measuring variance in non-deterministic models.
   * @default 1
   */
  trialCount?: number
  /**
   * Minimum pass rate required for `results.passed` to be `true`.
   * If not set, `results.passed` is always `true`.
   * Useful for CI: `if (!results.passed) process.exit(1)`.
   */
  threshold?: number
  /** Timeout per case in milliseconds. @default undefined (no timeout) */
  timeout?: number
  /** Options forwarded to `createAILogger`. Set `cost` map here for `estimatedCost`. */
  aiOptions?: AILoggerOptions
  /** Service name written to every wide event. @default 'eval' */
  service?: string
}

/** Drain function — same interface as evlog's drain. */
export type DrainFn = (ctx: DrainContext) => void | Promise<void>

/**
 * Result for a single trial run of a case.
 */
export interface TrialResult {
  trialIndex: number
  output: unknown
  scores: Record<string, number | boolean>
  scoreMetadata?: Record<string, Record<string, unknown>>
  passed: boolean
  durationMs: number
  ai?: AIEventData
  error?: string
}

/**
 * Result for a single eval case. When `trialCount > 1`, `scores` are
 * averaged across trials and `trials` contains each individual result.
 */
export interface EvalCaseResult {
  id: string
  input: unknown
  output: unknown
  expected?: unknown
  /** Scores from each scorer. Averaged across trials when `trialCount > 1`. */
  scores: Record<string, number | boolean>
  /** Metadata from scorers that returned `{ score, metadata }`. */
  scoreMetadata?: Record<string, Record<string, unknown>>
  passed: boolean
  durationMs: number
  /** Individual trial results when `trialCount > 1`. */
  trials?: TrialResult[]
  /** AI telemetry from `createAILogger` — tokens, cost, tool calls, etc. */
  ai?: AIEventData
  error?: string
}

/**
 * Aggregated results returned by `evalSuite.run()`.
 */
export interface EvalResults {
  name: string
  /**
   * Whether the eval passed. `true` if `passRate >= threshold`,
   * or always `true` when no `threshold` is set.
   */
  passed: boolean
  total: number
  passing: number
  failing: number
  /** Ratio of passing cases to total (0-1). */
  passRate: number
  /** Average score per scorer across all cases. */
  avgScores: Record<string, number>
  /** Summary scorer results (post-run). */
  summaryScores?: Record<string, number | boolean>
  /** Aggregated token counts from `ai.*` fields on all wide events. */
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  /** Sum of `estimatedCost` across all cases. Requires `aiOptions.cost` to be set. */
  estimatedCost?: number
  totalDurationMs: number
  p50DurationMs: number
  p95DurationMs: number
  /** All individual case results. */
  cases: EvalCaseResult[]
}

/**
 * An eval suite returned by `createEval`.
 */
export interface EvalSuite<TInput = unknown, TOutput = unknown> {
  /**
   * Run the eval. Returns aggregated results.
   * @param options.filter Optional predicate to run a subset of cases.
   * @param options.drain Override drain for this run only.
   */
  run(options?: {
    filter?: (c: EvalCase<TInput, TOutput>) => boolean
    drain?: DrainFn | DrainFn[]
  }): Promise<EvalResults>
}

// ---------------------------------------------------------------------------
// WideEvent augmentation — adds typed `eval` field to all wide events
// ---------------------------------------------------------------------------

declare module 'evlog' {
  interface BaseWideEvent {
    eval?: {
      name: string
      caseId: string
      input: unknown
      output?: unknown
      expected?: unknown
      scores?: Record<string, number | boolean>
      scoreMetadata?: Record<string, Record<string, unknown>>
      passed?: boolean
      durationMs?: number
      trial?: number
      error?: string
      meta?: Record<string, unknown>
    }
  }
}
