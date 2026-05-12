import type { DrainFn } from '../types'
import type { AIEventData } from 'evlog/ai'

/**
 * Options for `braintrustDrain`.
 */
export interface BraintrustDrainOptions {
  /** Braintrust API key. */
  apiKey: string
  /** Braintrust project name. The project is created if it does not exist. */
  projectName: string
  /**
   * Experiment name. Auto-generated from project name + timestamp if omitted.
   * Passing a stable name lets you accumulate results across multiple runs.
   */
  experimentName?: string
  /**
   * Braintrust API base URL. Defaults to the public API.
   * Override for self-hosted instances.
   * @default 'https://api.braintrust.dev'
   */
  baseUrl?: string
}

interface BraintrustExperimentRow {
  id: string
  input: unknown
  output?: unknown
  expected?: unknown
  scores?: Record<string, number | null>
  metadata?: Record<string, unknown>
  tags?: string[]
}

interface BraintrustState {
  experimentId: string | null
  initPromise: Promise<string> | null
}

/**
 * Drain eval results to Braintrust as experiment rows.
 *
 * Creates a Braintrust experiment on the first drain call, then inserts
 * each eval case as a row with `input`, `output`, `expected`, `scores`,
 * and AI telemetry in `metadata`.
 *
 * Uses Braintrust's REST API directly — no SDK dependency required.
 *
 * @example
 * ```ts
 * import { braintrustDrain } from '@evlog/eval/drains'
 *
 * drain: braintrustDrain({
 *   apiKey: process.env.BRAINTRUST_API_KEY!,
 *   projectName: 'my-app',
 *   experimentName: 'v1.2-summarizer',
 * })
 * ```
 */
export function braintrustDrain(options: BraintrustDrainOptions): DrainFn {
  const { apiKey, projectName, baseUrl = 'https://api.braintrust.dev' } = options
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  const state: BraintrustState = { experimentId: null, initPromise: null }

  async function initExperiment(evalName: string): Promise<string> {
    const experimentName = options.experimentName
      ?? `${evalName}-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`

    // Upsert project
    const projectRes = await fetch(`${baseUrl}/v1/project`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: projectName }),
    })
    if (!projectRes.ok) {
      const text = await projectRes.text()
      throw new Error(`[evlog/eval] braintrustDrain: failed to upsert project — ${projectRes.status} ${text}`)
    }
    const project = await projectRes.json() as { id: string }

    // Create experiment
    const expRes = await fetch(`${baseUrl}/v1/experiment`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: experimentName,
        project_id: project.id,
      }),
    })
    if (!expRes.ok) {
      const text = await expRes.text()
      throw new Error(`[evlog/eval] braintrustDrain: failed to create experiment — ${expRes.status} ${text}`)
    }
    const experiment = await expRes.json() as { id: string }
    return experiment.id
  }

  async function getExperimentId(evalName: string): Promise<string> {
    if (state.experimentId) return state.experimentId
    if (!state.initPromise) {
      state.initPromise = initExperiment(evalName).then(id => {
        state.experimentId = id
        return id
      })
    }
    return state.initPromise
  }

  return async ({ event }) => {
    const evalField = event.eval as {
      name?: string
      caseId?: string
      input?: unknown
      output?: unknown
      expected?: unknown
      scores?: Record<string, number | boolean>
      durationMs?: number
      error?: string
    } | undefined

    if (!evalField) return

    const evalName = evalField.name ?? 'eval'

    let experimentId: string
    try {
      experimentId = await getExperimentId(evalName)
    } catch (err) {
      console.error('[evlog/eval] braintrustDrain init failed:', err)
      return
    }

    // Map evlog eval scores to Braintrust scores (number | null, 0-1)
    const scores: Record<string, number | null> = {}
    if (evalField.scores) {
      for (const [key, val] of Object.entries(evalField.scores)) {
        scores[key] = typeof val === 'boolean' ? (val ? 1 : 0) : val
      }
    }

    // Map ai.* fields to Braintrust metadata
    const aiData = event.ai as AIEventData | undefined
    const metadata: Record<string, unknown> = {
      ...(evalField.durationMs !== undefined ? { durationMs: evalField.durationMs } : {}),
      ...(evalField.error ? { error: evalField.error } : {}),
      ...(aiData ? {
        ai: {
          inputTokens: aiData.inputTokens,
          outputTokens: aiData.outputTokens,
          totalTokens: aiData.totalTokens,
          ...(aiData.cacheReadTokens !== undefined ? { cacheReadTokens: aiData.cacheReadTokens } : {}),
          ...(aiData.estimatedCost !== undefined ? { estimatedCost: aiData.estimatedCost } : {}),
          ...(aiData.model ? { model: aiData.model } : {}),
          ...(aiData.calls ? { calls: aiData.calls } : {}),
          ...(aiData.steps ? { steps: aiData.steps } : {}),
          ...(aiData.toolCalls ? { toolCalls: aiData.toolCalls } : {}),
          ...(aiData.finishReason ? { finishReason: aiData.finishReason } : {}),
        },
      } : {}),
    }

    const row: BraintrustExperimentRow = {
      id: evalField.caseId ?? crypto.randomUUID(),
      input: evalField.input,
      ...(evalField.output !== undefined ? { output: evalField.output } : {}),
      ...(evalField.expected !== undefined ? { expected: evalField.expected } : {}),
      ...(Object.keys(scores).length > 0 ? { scores } : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    }

    try {
      const res = await fetch(`${baseUrl}/v1/experiment/${experimentId}/insert`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ events: [row] }),
      })
      if (!res.ok) {
        const text = await res.text()
        console.error(`[evlog/eval] braintrustDrain insert failed: ${res.status} ${text}`)
      }
    } catch (err) {
      console.error('[evlog/eval] braintrustDrain network error:', err)
    }
  }
}
