import type { EveEvalResult, EveEvalRunSummary } from 'eve/evals'
import { describe, expect, it } from 'vitest'
import { resolveRunIdentity, toEvalEvent, toRunEvent } from './posthog'

const identity = { runId: '42', model: 'deepseek/deepseek-v4-flash', commit: 'abc1234', branch: 'main' }

function evalResult(overrides: Partial<EveEvalResult> = {}): EveEvalResult {
  return {
    id: 'budget/no-fan-out',
    result: { output: null, finalMessage: null, sessionId: 'sess_1' },
    assertions: [],
    verdict: 'passed',
    startedAt: '2026-08-10T12:00:00.000Z',
    completedAt: '2026-08-10T12:00:04.500Z',
    ...overrides,
  } as EveEvalResult
}

function assertion(name: string, passed: boolean) {
  return { name, score: passed ? 1 : 0, severity: 'gate', passed } as const
}

describe('toEvalEvent', () => {
  it('records the eval outcome and its duration', () => {
    const event = toEvalEvent(evalResult(), identity)

    expect(event.evalId).toBe('budget/no-fan-out')
    expect(event.verdict).toBe('passed')
    expect(event.durationMs).toBe(4500)
    expect(event.level).toBe('info')
  })

  it('carries the eve session id that joins to the llm traces', () => {
    const event = toEvalEvent(evalResult(), identity)

    expect(event.eveSessionId).toBe('sess_1')
  })

  it('names the failed assertions and raises the level', () => {
    const event = toEvalEvent(evalResult({
      verdict: 'failed',
      assertions: [assertion('succeeded', true), assertion('maxToolCalls', false)],
    }), identity)

    expect(event.level).toBe('error')
    expect(event.assertions).toBe(2)
    expect(event.assertionsFailed).toBe(1)
    expect(event.failedAssertions).toBe('maxToolCalls')
  })

  it('omits the failure fields on a clean eval', () => {
    const event = toEvalEvent(evalResult({ assertions: [assertion('succeeded', true)] }), identity)

    expect(event).not.toHaveProperty('failedAssertions')
    expect(event).not.toHaveProperty('error')
  })

  it('stamps the run identity so runs stay comparable', () => {
    const event = toEvalEvent(evalResult(), identity)

    expect(event).toMatchObject(identity)
  })
})

describe('toRunEvent', () => {
  const summary = {
    target: { kind: 'local', url: 'http://localhost:3000', capabilities: { devRoutes: true } },
    results: [evalResult(), evalResult()],
    startedAt: '2026-08-10T12:00:00.000Z',
    completedAt: '2026-08-10T12:01:00.000Z',
    passed: 1,
    failed: 1,
    scored: 0,
    skipped: 0,
    errored: 0,
  } as EveEvalRunSummary

  it('rolls the run up with its verdict counts', () => {
    const event = toRunEvent(summary, identity)

    expect(event).toMatchObject({ evals: 2, passed: 1, failed: 1, durationMs: 60_000, target: 'local' })
  })

  it('reports a run with failures as an error', () => {
    expect(toRunEvent(summary, identity).level).toBe('error')
    expect(toRunEvent({ ...summary, failed: 0 }, identity).level).toBe('info')
  })
})

describe('resolveRunIdentity', () => {
  it('reads the run, commit and branch from the CI environment', () => {
    const resolved = resolveRunIdentity({
      GITHUB_RUN_ID: '99',
      GITHUB_SHA: 'abcdef1234567890',
      GITHUB_REF_NAME: 'feat/x',
      EVI_MODEL: 'anthropic/claude-opus-5',
    } as NodeJS.ProcessEnv)

    expect(resolved).toEqual({
      runId: '99',
      model: 'anthropic/claude-opus-5',
      commit: 'abcdef1',
      branch: 'feat/x',
    })
  })

  it('falls back to a local identity outside CI', () => {
    const resolved = resolveRunIdentity({} as NodeJS.ProcessEnv)

    expect(resolved.runId).toBe('local')
    expect(resolved.model).toBe('default')
    expect(resolved).not.toHaveProperty('commit')
  })
})
