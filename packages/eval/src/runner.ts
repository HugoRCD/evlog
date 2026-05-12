import { createLogger } from 'evlog'
import { createAILogger } from 'evlog/ai'
import type {
  DrainFn,
  EvalCase,
  EvalCaseResult,
  EvalOptions,
  EvalResults,
  EvalSuite,
  EvalTaskContext,
  ScoreResult,
  Scorer,
  ScorerContext,
  SummaryScorer,
  TrialResult,
} from './types'
import type { AIEventData } from 'evlog/ai'
import type { WideEvent } from 'evlog'

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

let _idCounter = 0

function generateId(): string {
  return `case-${++_idCounter}-${Math.random().toString(36).slice(2, 7)}`
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]!
}

function normalizeScore(raw: ScoreResult): { score: number | boolean; metadata?: Record<string, unknown> } {
  if (typeof raw === 'number' || typeof raw === 'boolean') return { score: raw }
  return raw
}

function scorePasses(raw: number | boolean, threshold: number): boolean {
  if (typeof raw === 'boolean') return raw
  return raw >= threshold
}

async function runScorers<TInput, TOutput>(
  scorers: Scorer<TInput, TOutput>[],
  ctx: ScorerContext<TInput, TOutput>,
): Promise<{ scores: Record<string, number | boolean>; metadata: Record<string, Record<string, unknown>> }> {
  const scores: Record<string, number | boolean> = {}
  const metadata: Record<string, Record<string, unknown>> = {}

  for (const scorer of scorers) {
    try {
      const raw = await scorer.score(ctx)
      const { score, metadata: meta } = normalizeScore(raw)
      scores[scorer.name] = score
      if (meta) metadata[scorer.name] = meta
    } catch (err) {
      scores[scorer.name] = false
      metadata[scorer.name] = { error: err instanceof Error ? err.message : String(err) }
    }
  }

  return { scores, metadata }
}

function casePassesScorers<TInput, TOutput>(
  scores: Record<string, number | boolean>,
  scorers: Scorer<TInput, TOutput>[],
): boolean {
  for (const scorer of scorers) {
    const score = scores[scorer.name]
    if (score === undefined) continue
    if (!scorePasses(score, scorer.threshold ?? 0.5)) return false
  }
  return true
}

function averageScores(
  trials: Array<{ scores: Record<string, number | boolean> }>,
): Record<string, number | boolean> {
  if (trials.length === 0) return {}
  if (trials.length === 1) return { ...trials[0]!.scores }

  const keys = Object.keys(trials[0]!.scores)
  const result: Record<string, number | boolean> = {}

  for (const key of keys) {
    const values = trials.map(t => t.scores[key] ?? false)
    const allBool = values.every(v => typeof v === 'boolean')
    if (allBool) {
      // Majority vote for boolean scorers
      const trueCount = values.filter(Boolean).length
      result[key] = trueCount > trials.length / 2
    } else {
      // Average for numeric scorers
      const nums = values.map(v => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
      result[key] = nums.reduce((a, b) => a + b, 0) / nums.length
    }
  }

  return result
}

async function collectDataset<TInput, TOutput>(
  dataset: EvalOptions<TInput, TOutput>['dataset'],
): Promise<EvalCase<TInput, TOutput>[]> {
  if (typeof dataset === 'function') return dataset()
  if (Array.isArray(dataset)) return dataset

  // AsyncIterable
  const cases: EvalCase<TInput, TOutput>[] = []
  for await (const c of dataset) cases.push(c)
  return cases
}

// ---------------------------------------------------------------------------
// Concurrency limiter — no external dependencies
// ---------------------------------------------------------------------------

function createConcurrencyLimiter(concurrency: number) {
  let running = 0
  const queue: Array<() => void> = []

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        running++
        fn().then(resolve, reject).finally(() => {
          running--
          const next = queue.shift()
          if (next) next()
        })
      }

      if (running < concurrency) {
        run()
      } else {
        queue.push(run)
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Drain helper — fans out to multiple drains in parallel
// ---------------------------------------------------------------------------

async function drain(ctx: Parameters<DrainFn>[0], drains: DrainFn[]): Promise<void> {
  if (drains.length === 0) return
  await Promise.allSettled(drains.map(d => {
    try {
      return Promise.resolve(d(ctx))
    } catch (err) {
      console.error('[evlog/eval] drain error:', err)
      return Promise.resolve()
    }
  }))
}

function normalizeDrains(fn?: DrainFn | DrainFn[]): DrainFn[] {
  if (!fn) return []
  return Array.isArray(fn) ? fn : [fn]
}

// ---------------------------------------------------------------------------
// Per-trial runner
// ---------------------------------------------------------------------------

async function runTrial<TInput, TOutput>(
  evalCase: EvalCase<TInput, TOutput>,
  caseId: string,
  trialIndex: number,
  options: EvalOptions<TInput, TOutput>,
  drains: DrainFn[],
): Promise<{ trial: TrialResult; event: WideEvent | null }> {
  const start = Date.now()
  const { name, scorers = [], service = 'eval', aiOptions, timeout } = options

  // Create a standalone logger for this trial (not HTTP-bound)
  const log = createLogger({
    service,
    requestId: trialIndex > 0 ? `${caseId}-t${trialIndex}` : caseId,
  })

  log.set({
    eval: {
      name,
      caseId,
      input: evalCase.input,
      ...(evalCase.expected !== undefined ? { expected: evalCase.expected } : {}),
      ...(evalCase.meta ? { meta: evalCase.meta } : {}),
      ...(trialIndex > 0 ? { trial: trialIndex } : {}),
    },
  } as Record<string, unknown>)

  // Pre-wire AI logger
  const ai = createAILogger(log, aiOptions)

  const taskCtx: EvalTaskContext = { log, ai, case: evalCase as EvalCase, trialIndex }

  let output: TOutput | undefined
  let taskError: string | undefined

  // Run task (with optional timeout)
  try {
    const taskPromise = Promise.resolve(options.task(evalCase.input, taskCtx))
    if (timeout) {
      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Eval case timed out after ${timeout}ms`)), timeout),
      )
      output = await Promise.race([taskPromise, timer])
    } else {
      output = await taskPromise
    }
  } catch (err) {
    taskError = err instanceof Error ? err.message : String(err)
    log.error(taskError ?? 'unknown error')
  }

  const durationMs = Date.now() - start

  // Build scorer context using the current wide event snapshot
  // We emit the event first to capture ai.* fields from createAILogger
  // We need to set output before emitting so scorers see the final state
  log.set({
    eval: {
      ...(output !== undefined ? { output } : {}),
      durationMs,
      ...(taskError ? { error: taskError } : {}),
    },
  } as Record<string, unknown>)

  // Emit wide event (captures ai.* from createAILogger flush)
  const event = log.emit()

  // Run scorers on the emitted event
  const scorerCtx: ScorerContext<TInput, TOutput> = {
    input: evalCase.input,
    output: output as TOutput,
    expected: evalCase.expected,
    event: event ?? {} as WideEvent,
  }

  const { scores, metadata: scoreMeta } = await runScorers(scorers, scorerCtx)
  const passed = casePassesScorers(scores, scorers)

  // Build trial result — a task error always marks the case as failed
  const ai_data = (event?.ai as AIEventData | undefined)
  const trial: TrialResult = {
    trialIndex,
    output,
    scores,
    ...(Object.keys(scoreMeta).length > 0 ? { scoreMetadata: scoreMeta } : {}),
    passed: taskError ? false : passed,
    durationMs,
    ...(ai_data ? { ai: ai_data } : {}),
    ...(taskError ? { error: taskError } : {}),
  }

  // Drain the wide event (with scores injected)
  if (event && drains.length > 0) {
    // Re-attach scores to event for drain consumers
    const existing = (event as Record<string, unknown>).eval ?? {}
    ;(event as Record<string, unknown>).eval = {
      ...(existing as Record<string, unknown>),
      scores,
      ...(Object.keys(scoreMeta).length > 0 ? { scoreMetadata: scoreMeta } : {}),
      passed,
    }
    await drain({ event }, drains)
  }

  return { trial, event }
}

// ---------------------------------------------------------------------------
// Per-case runner (aggregates trials)
// ---------------------------------------------------------------------------

async function runCase<TInput, TOutput>(
  evalCase: EvalCase<TInput, TOutput>,
  options: EvalOptions<TInput, TOutput>,
  drains: DrainFn[],
): Promise<EvalCaseResult> {
  const caseId = evalCase.id ?? generateId()
  const trialCount = options.trialCount ?? 1
  const trials: TrialResult[] = []

  for (let i = 0; i < trialCount; i++) {
    const { trial } = await runTrial(evalCase, caseId, i, options, drains)
    trials.push(trial)
  }

  // Aggregate across trials
  const scores = averageScores(trials)
  const scorers = options.scorers ?? []
  // If all trials errored, the case fails regardless of scorer results
  const allErrored = trials.every(t => t.error !== undefined)
  const passed = allErrored ? false : casePassesScorers(scores, scorers)

  // Pick the last trial's output as representative
  const lastTrial = trials[trials.length - 1]!
  const totalDurationMs = trials.reduce((s, t) => s + t.durationMs, 0)

  // Merge scoreMetadata from last trial (or all if needed)
  const scoreMetadata = lastTrial.scoreMetadata

  const result: EvalCaseResult = {
    id: caseId,
    input: evalCase.input,
    output: lastTrial.output,
    ...(evalCase.expected !== undefined ? { expected: evalCase.expected } : {}),
    scores,
    ...(scoreMetadata && Object.keys(scoreMetadata).length > 0 ? { scoreMetadata } : {}),
    passed,
    durationMs: trialCount === 1 ? lastTrial.durationMs : totalDurationMs,
    ...(trialCount > 1 ? { trials } : {}),
    ...(lastTrial.ai ? { ai: lastTrial.ai } : {}),
    ...(lastTrial.error ? { error: lastTrial.error } : {}),
  }

  return result
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregateResults(name: string, cases: EvalCaseResult[], options: EvalOptions): Omit<EvalResults, 'cases' | 'summaryScores'> {
  const passing = cases.filter(c => c.passed).length
  const failing = cases.length - passing
  const passRate = cases.length > 0 ? passing / cases.length : 0

  // Per-scorer averages
  const scorerNames = cases.length > 0 ? Object.keys(cases[0]!.scores) : []
  const avgScores: Record<string, number> = {}
  for (const scorer of scorerNames) {
    const vals = cases.map(c => {
      const v = c.scores[scorer]
      return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? 0)
    })
    avgScores[scorer] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }

  // Token aggregates from ai.* fields
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheReadTokens = 0
  let estimatedCostTotal = 0
  let hasCost = false

  for (const c of cases) {
    if (c.ai) {
      totalInputTokens += c.ai.inputTokens ?? 0
      totalOutputTokens += c.ai.outputTokens ?? 0
      totalCacheReadTokens += c.ai.cacheReadTokens ?? 0
      if (c.ai.estimatedCost !== undefined) {
        estimatedCostTotal += c.ai.estimatedCost
        hasCost = true
      }
    }
  }

  // Timing percentiles
  const durations = [...cases.map(c => c.durationMs)].sort((a, b) => a - b)
  const totalDurationMs = durations.reduce((a, b) => a + b, 0)
  const p50DurationMs = percentile(durations, 50)
  const p95DurationMs = percentile(durations, 95)

  const threshold = options.threshold
  const passed = threshold !== undefined ? passRate >= threshold : true

  return {
    name,
    passed,
    total: cases.length,
    passing,
    failing,
    passRate,
    avgScores,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    ...(hasCost ? { estimatedCost: Math.round(estimatedCostTotal * 1_000_000) / 1_000_000 } : {}),
    totalDurationMs,
    p50DurationMs,
    p95DurationMs,
  }
}

async function runSummaryScorers(
  scorers: SummaryScorer[],
  cases: EvalCaseResult[],
): Promise<Record<string, number | boolean>> {
  const summaryScores: Record<string, number | boolean> = {}
  for (const scorer of scorers) {
    try {
      const raw = await scorer.score(cases)
      const { score } = normalizeScore(raw)
      summaryScores[scorer.name] = score
    } catch (err) {
      summaryScores[scorer.name] = false
    }
  }
  return summaryScores
}

// ---------------------------------------------------------------------------
// createEval — public API
// ---------------------------------------------------------------------------

/**
 * Create an eval suite.
 *
 * Each case runs the `task` function, captures AI telemetry automatically
 * via `createAILogger`, scores the output with each scorer, and drains the
 * result as a structured `WideEvent` to any evlog-compatible drain.
 *
 * @example
 * ```ts
 * import { createEval, exactMatch, llmJudge } from '@evlog/eval'
 * import { maxSteps, noToolLoop } from '@evlog/eval/ai-scorers'
 * import { braintrustDrain, jsonlDrain } from '@evlog/eval/drains'
 *
 * const myEval = createEval({
 *   name: 'summarization-quality',
 *   dataset: [
 *     { id: 'c1', input: 'Long article...', expected: 'Short summary.' },
 *   ],
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
export function createEval<TInput = unknown, TOutput = unknown>(
  options: EvalOptions<TInput, TOutput>,
): EvalSuite<TInput, TOutput> {
  return {
    async run(runOptions) {
      const optDrains = normalizeDrains(runOptions?.drain ?? options.drain)
      const limit = createConcurrencyLimiter(options.concurrency ?? 5)

      // Collect dataset
      let cases = await collectDataset(options.dataset)

      // Apply filter if provided
      if (runOptions?.filter) {
        cases = cases.filter(runOptions.filter)
      }

      // Run all cases with concurrency limit
      const caseResults = await Promise.all(
        cases.map(c => limit(() => runCase(c, options, optDrains))),
      )

      // Aggregate
      const aggregate = aggregateResults(options.name, caseResults, options as EvalOptions)

      // Summary scorers
      let summaryScores: Record<string, number | boolean> | undefined
      if (options.summaryScorers && options.summaryScorers.length > 0) {
        summaryScores = await runSummaryScorers(options.summaryScorers, caseResults)
      }

      return {
        ...aggregate,
        ...(summaryScores ? { summaryScores } : {}),
        cases: caseResults,
      }
    },
  }
}
