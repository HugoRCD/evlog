import type { EveEvalResult, EveEvalRunSummary } from 'eve/evals'
import type { EvalReporter } from 'eve/evals/reporters'
import type { WideEvent } from 'evlog'
import { sendBatchToPostHogEvents } from 'evlog/posthog'
import { MODEL } from '../../agent/lib/model'

/** Recorded on every event so runs stay comparable. */
export interface EvalRunIdentity {
  /** Groups one `eve eval` invocation. */
  runId: string
  /** Model the suite ran against. */
  model: string
  commit?: string
  branch?: string
}

const SERVICE = 'evi-evals'

export function resolveRunIdentity(env: NodeJS.ProcessEnv = process.env): EvalRunIdentity {
  return {
    // `||`, not `??`: an unset workflow_dispatch input arrives as an empty string.
    runId: env.GITHUB_RUN_ID || 'local',
    model: MODEL,
    ...(env.GITHUB_SHA ? { commit: env.GITHUB_SHA.slice(0, 7) } : {}),
    ...(env.GITHUB_REF_NAME ? { branch: env.GITHUB_REF_NAME } : {}),
  }
}

function durationMs(startedAt: string, completedAt: string): number {
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt))
}

/** One wide event per eval. `eveSessionId` joins it to that run's LLM generations. */
export function toEvalEvent(result: EveEvalResult, identity: EvalRunIdentity): WideEvent {
  const failed = result.assertions.filter(assertion => !assertion.passed)
  return {
    timestamp: result.completedAt,
    level: result.verdict === 'failed' ? 'error' : 'info',
    service: SERVICE,
    environment: 'eval',
    evalId: result.id,
    verdict: result.verdict,
    durationMs: durationMs(result.startedAt, result.completedAt),
    assertions: result.assertions.length,
    assertionsFailed: failed.length,
    ...(failed.length > 0 ? { failedAssertions: failed.map(a => a.name).join(',') } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.result.sessionId ? { eveSessionId: result.result.sessionId } : {}),
    ...identity,
  }
}

/** One wide event per run, for pass rate and total wall clock over time. */
export function toRunEvent(summary: EveEvalRunSummary, identity: EvalRunIdentity): WideEvent {
  return {
    timestamp: summary.completedAt,
    level: summary.failed > 0 ? 'error' : 'info',
    service: SERVICE,
    environment: 'eval',
    evals: summary.results.length,
    passed: summary.passed,
    failed: summary.failed,
    scored: summary.scored,
    skipped: summary.skipped,
    errored: summary.errored,
    durationMs: durationMs(summary.startedAt, summary.completedAt),
    target: summary.target.kind,
    ...identity,
  }
}

/**
 * Report eval outcomes to PostHog: one event per eval, one per run. Stays
 * silent without `POSTHOG_API_KEY`.
 */
export function PostHogReporter(identity?: EvalRunIdentity): EvalReporter {
  const results: EveEvalResult[] = []

  return {
    onRunStart() {},
    onEvalComplete(result) {
      results.push(result)
    },
    async onRunComplete(summary) {
      // Read here, not at construction: eve loads the env files after importing this.
      const apiKey = process.env.POSTHOG_API_KEY
      if (!apiKey) return
      const runIdentity = identity ?? resolveRunIdentity()
      const config = {
        apiKey,
        ...(process.env.POSTHOG_HOST ? { host: process.env.POSTHOG_HOST } : {}),
      }
      // Reporting never decides the run's outcome.
      try {
        await sendBatchToPostHogEvents(
          results.map(result => toEvalEvent(result, runIdentity)),
          { ...config, eventName: 'evi_eval' },
        )
        await sendBatchToPostHogEvents(
          [toRunEvent(summary, runIdentity)],
          { ...config, eventName: 'evi_eval_run' },
        )
      } catch (error) {
        console.error('[evi/evals] PostHog reporting failed:', error)
      }
    },
  }
}
