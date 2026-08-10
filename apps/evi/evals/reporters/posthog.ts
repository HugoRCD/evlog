import type { EveEvalResult, EveEvalRunSummary } from 'eve/evals'
import type { EvalReporter } from 'eve/evals/reporters'
import type { WideEvent } from 'evlog'
import { sendBatchToPostHogEvents } from 'evlog/posthog'

/** Where a run came from, recorded on every event so runs stay comparable. */
export interface EvalRunIdentity {
  /** Groups one `eve eval` invocation. */
  runId: string
  /** Model under test — the breakdown that answers "did the swap cost us?". */
  model: string
  commit?: string
  branch?: string
}

const SERVICE = 'evi-evals'

export function resolveRunIdentity(env: NodeJS.ProcessEnv = process.env): EvalRunIdentity {
  return {
    // `||`, not `??`: an unset workflow_dispatch input arrives as an empty
    // string, which would otherwise be recorded as the model under test.
    runId: env.GITHUB_RUN_ID || 'local',
    model: env.EVI_MODEL || 'default',
    ...(env.GITHUB_SHA ? { commit: env.GITHUB_SHA.slice(0, 7) } : {}),
    ...(env.GITHUB_REF_NAME ? { branch: env.GITHUB_REF_NAME } : {}),
  }
}

function durationMs(startedAt: string, completedAt: string): number {
  return Math.max(0, Date.parse(completedAt) - Date.parse(startedAt))
}

/**
 * One wide event per eval. `eveSessionId` is the join key: the agent's LLM
 * generations reach PostHog carrying the same session id, so cost and latency
 * for an eval are a lookup away rather than a number this reporter has to
 * compute itself.
 */
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
 * Report eval outcomes to PostHog as custom events, one per eval plus one per
 * run. They are events rather than logs because the question asked of them is
 * a trend — is this eval getting slower, is the pass rate drifting — which is
 * what insights and alerts are built on.
 *
 * Without `POSTHOG_API_KEY` the reporter stays silent, so a local run needs no
 * setup and CI without the secret still runs the evals.
 */
export function PostHogReporter(identity = resolveRunIdentity()): EvalReporter {
  const results: EveEvalResult[] = []
  const apiKey = process.env.POSTHOG_API_KEY

  return {
    onRunStart() {},
    onEvalComplete(result) {
      results.push(result)
    },
    async onRunComplete(summary) {
      if (!apiKey) return
      const config = {
        apiKey,
        ...(process.env.POSTHOG_HOST ? { host: process.env.POSTHOG_HOST } : {}),
      }
      // Reporting must never decide the run's outcome: a failed upload is
      // worth a line on stderr and nothing more.
      try {
        await sendBatchToPostHogEvents(
          results.map(result => toEvalEvent(result, identity)),
          { ...config, eventName: 'evi_eval' },
        )
        await sendBatchToPostHogEvents(
          [toRunEvent(summary, identity)],
          { ...config, eventName: 'evi_eval_run' },
        )
      } catch (error) {
        console.error('[evi/evals] PostHog reporting failed:', error)
      }
    },
  }
}
