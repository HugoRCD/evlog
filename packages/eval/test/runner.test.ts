import { describe, expect, it, vi } from 'vitest'
import { createEval, exactMatch, contains } from '../src/index'
import type { DrainFn } from '../src/types'

describe('createEval', () => {
  it('runs a simple eval and returns results', async () => {
    const result = await createEval({
      name: 'basic',
      dataset: [
        { id: 'c1', input: 'hello', expected: 'world' },
        { id: 'c2', input: 'foo', expected: 'foo' },
      ],
      task: async (input) => input,
      scorers: [exactMatch],
    }).run()

    expect(result.name).toBe('basic')
    expect(result.total).toBe(2)
    expect(result.passing).toBe(1)
    expect(result.failing).toBe(1)
    expect(result.passRate).toBe(0.5)
    expect(result.cases).toHaveLength(2)
    expect(result.cases[0]!.scores['exact-match']).toBe(false)
    expect(result.cases[1]!.scores['exact-match']).toBe(true)
  })

  it('respects threshold for passed field', async () => {
    const result = await createEval({
      name: 'threshold-test',
      dataset: [
        { id: 'c1', input: 'hello', expected: 'hello' },
        { id: 'c2', input: 'foo', expected: 'bar' },
      ],
      task: async (input) => input,
      scorers: [exactMatch],
      threshold: 0.8,
    }).run()

    // passRate = 0.5 < 0.8 → not passed
    expect(result.passed).toBe(false)
    expect(result.passRate).toBe(0.5)
  })

  it('passed is true when no threshold set', async () => {
    const result = await createEval({
      name: 'no-threshold',
      dataset: [{ id: 'c1', input: 'hello', expected: 'world' }],
      task: async (input) => input,
      scorers: [exactMatch],
    }).run()

    expect(result.passed).toBe(true)
  })

  it('drains each case as a WideEvent', async () => {
    const drainFn = vi.fn() as ReturnType<typeof vi.fn<DrainFn>>

    await createEval({
      name: 'drain-test',
      dataset: [
        { id: 'c1', input: 'a' },
        { id: 'c2', input: 'b' },
      ],
      task: async (input) => input,
      drain: drainFn as DrainFn,
    }).run()

    expect(drainFn).toHaveBeenCalledTimes(2)

    const firstEvent = drainFn.mock.calls[0]![0].event
    expect(firstEvent.service).toBe('eval')
    expect(firstEvent.eval).toBeDefined()
    expect((firstEvent.eval as { name: string }).name).toBe('drain-test')
  })

  it('fans out to multiple drains', async () => {
    const drain1 = vi.fn() as ReturnType<typeof vi.fn<DrainFn>>
    const drain2 = vi.fn() as ReturnType<typeof vi.fn<DrainFn>>

    await createEval({
      name: 'multi-drain',
      dataset: [{ id: 'c1', input: 'x' }],
      task: async (input) => input,
      drain: [drain1 as DrainFn, drain2 as DrainFn],
    }).run()

    expect(drain1).toHaveBeenCalledTimes(1)
    expect(drain2).toHaveBeenCalledTimes(1)
  })

  it('handles task errors gracefully', async () => {
    const result = await createEval({
      name: 'error-test',
      dataset: [{ id: 'c1', input: 'bad' }],
      task: async () => {
        throw new Error('task failed')
      },
      scorers: [exactMatch],
    }).run()

    expect(result.cases[0]!.error).toBe('task failed')
    expect(result.cases[0]!.passed).toBe(false)
  })

  it('aggregates multiple scorers', async () => {
    const result = await createEval({
      name: 'multi-scorer',
      dataset: [{ id: 'c1', input: 'hello world', expected: 'hello world' }],
      task: async (input) => input,
      scorers: [exactMatch, contains('hello')],
    }).run()

    expect(result.cases[0]!.scores['exact-match']).toBe(true)
    expect(result.cases[0]!.scores['contains(hello)']).toBe(true)
    expect(result.passing).toBe(1)
  })

  it('respects filter option', async () => {
    const drainFn = vi.fn() as ReturnType<typeof vi.fn<DrainFn>>
    const result = await createEval({
      name: 'filter-test',
      dataset: [
        { id: 'c1', input: 'a' },
        { id: 'c2', input: 'b' },
        { id: 'c3', input: 'c' },
      ],
      task: async (input) => input,
      drain: drainFn as DrainFn,
    }).run({ filter: c => c.id !== 'c2' })

    expect(result.total).toBe(2)
    expect(drainFn).toHaveBeenCalledTimes(2)
  })

  it('runs trials and aggregates boolean scores by majority vote', async () => {
    let callCount = 0
    const result = await createEval({
      name: 'trial-test',
      dataset: [{ id: 'c1', input: 'hello', expected: 'hello' }],
      task: async (input) => {
        callCount++
        return input
      },
      scorers: [exactMatch],
      trialCount: 3,
    }).run()

    expect(callCount).toBe(3)
    expect(result.cases[0]!.trials).toHaveLength(3)
    // All trials: output='hello', expected='hello' → exactMatch=true for all 3
    expect(result.cases[0]!.scores['exact-match']).toBe(true)
  })

  it('runs summary scorers after all cases', async () => {
    const result = await createEval({
      name: 'summary-scorer-test',
      dataset: [
        { id: 'c1', input: 'a', expected: 'a' },
        { id: 'c2', input: 'b', expected: 'x' },
      ],
      task: async (input) => input,
      scorers: [exactMatch],
      summaryScorers: [
        {
          name: 'majority-pass',
          score: (cases) => cases.filter(c => c.passed).length > cases.length / 2,
        },
      ],
    }).run()

    expect(result.summaryScores).toBeDefined()
    expect(result.summaryScores!['majority-pass']).toBe(false)
  })

  it('accepts dataset as async factory', async () => {
    const result = await createEval({
      name: 'factory-test',
      dataset: async () => [{ id: 'c1', input: 'x', expected: 'x' }],
      task: async (input) => input,
      scorers: [exactMatch],
    }).run()

    expect(result.total).toBe(1)
    expect(result.passing).toBe(1)
  })

  it('computes timing percentiles', async () => {
    const result = await createEval({
      name: 'timing-test',
      dataset: [
        { id: 'c1', input: 'a' },
        { id: 'c2', input: 'b' },
        { id: 'c3', input: 'c' },
      ],
      task: async (input) => input,
    }).run()

    expect(result.p50DurationMs).toBeGreaterThanOrEqual(0)
    expect(result.p95DurationMs).toBeGreaterThanOrEqual(result.p50DurationMs)
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0)
  })

  it('wide event has eval field with scores after drain', async () => {
    const drainFn = vi.fn() as ReturnType<typeof vi.fn<DrainFn>>

    await createEval({
      name: 'eval-field-test',
      dataset: [{ id: 'c1', input: 'hello', expected: 'hello' }],
      task: async (input) => input,
      scorers: [exactMatch],
      drain: drainFn as DrainFn,
    }).run()

    const event = drainFn.mock.calls[0]![0].event
    const evalField = event.eval as {
      name: string
      scores: Record<string, boolean>
      passed: boolean
    }
    expect(evalField.name).toBe('eval-field-test')
    expect(evalField.scores['exact-match']).toBe(true)
    expect(evalField.passed).toBe(true)
  })

  it('averages numeric scores across trials', async () => {
    let callIndex = 0
    // Returns 'hello' on even calls, 'world' on odd calls
    // exactMatch (expected: 'hello') → true, false, true → majority true
    const result = await createEval({
      name: 'numeric-trial',
      dataset: [{ id: 'c1', input: 'hello', expected: 'hello' }],
      task: async (input) => {
        const out = callIndex % 2 === 0 ? input : 'other'
        callIndex++
        return out
      },
      scorers: [exactMatch],
      trialCount: 3,
    }).run()

    // 2/3 trials pass → majority true
    expect(result.cases[0]!.scores['exact-match']).toBe(true)
  })
})
