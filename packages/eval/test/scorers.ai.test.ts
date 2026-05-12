import { describe, expect, it } from 'vitest'
import {
  maxSteps,
  maxCalls,
  maxToolCallFrequency,
  noToolLoop,
  minCacheHitRate,
  finishesCleanly,
  maxCost,
  maxLatency,
  maxTokensPerStep,
  minThroughput,
} from '../src/scorers/ai'
import type { ScorerContext } from '../src/types'
import type { WideEvent } from 'evlog'

function makeCtx(aiOverrides: Record<string, unknown> = {}): ScorerContext {
  return {
    input: 'input',
    output: 'output',
    event: {
      timestamp: '',
      level: 'info',
      service: 'eval',
      environment: 'test',
      ai: {
        calls: 3,
        steps: 3,
        inputTokens: 1000,
        outputTokens: 200,
        totalTokens: 1200,
        cacheReadTokens: 300,
        finishReason: 'stop',
        estimatedCost: 0.005,
        totalDurationMs: 1500,
        tokensPerSecond: 80,
        toolCalls: ['search', 'read', 'search', 'write'],
        ...aiOverrides,
      },
    } as unknown as WideEvent,
  }
}

describe('maxSteps', () => {
  it('passes when steps <= limit', () => {
    const result = maxSteps(5).score(makeCtx({ steps: 3 }))
    expect(result).toMatchObject({ score: true, metadata: { steps: 3, limit: 5 } })
  })

  it('fails when steps > limit', () => {
    const result = maxSteps(2).score(makeCtx({ steps: 3 }))
    expect(result).toMatchObject({ score: false, metadata: { steps: 3, limit: 2 } })
  })

  it('defaults to 1 when steps undefined', () => {
    const result = maxSteps(1).score(makeCtx({ steps: undefined }))
    expect(result).toMatchObject({ score: true })
  })
})

describe('maxCalls', () => {
  it('passes when calls <= limit', () => {
    const result = maxCalls(5).score(makeCtx({ calls: 3 }))
    expect(result).toMatchObject({ score: true })
  })

  it('fails when calls > limit', () => {
    const result = maxCalls(2).score(makeCtx({ calls: 3 }))
    expect(result).toMatchObject({ score: false })
  })
})

describe('maxToolCallFrequency', () => {
  it('passes when tool called <= max times', () => {
    const result = maxToolCallFrequency('search', 3).score(makeCtx({ toolCalls: ['search', 'read', 'search'] }))
    expect(result).toMatchObject({ score: true, metadata: { count: 2, tool: 'search', limit: 3 } })
  })

  it('fails when tool called > max times', () => {
    const result = maxToolCallFrequency('search', 1).score(makeCtx({ toolCalls: ['search', 'search', 'read'] }))
    expect(result).toMatchObject({ score: false, metadata: { count: 2 } })
  })

  it('passes when tool never called', () => {
    const result = maxToolCallFrequency('search', 0).score(makeCtx({ toolCalls: ['read', 'write'] }))
    expect(result).toMatchObject({ score: true, metadata: { count: 0 } })
  })

  it('handles empty toolCalls', () => {
    const result = maxToolCallFrequency('search', 0).score(makeCtx({ toolCalls: [] }))
    expect(result).toMatchObject({ score: true })
  })
})

describe('noToolLoop', () => {
  it('passes when no tool exceeds threshold', () => {
    const result = noToolLoop(5).score(makeCtx({ toolCalls: ['a', 'b', 'a', 'c'] }))
    expect(result).toMatchObject({ score: true })
  })

  it('fails when a tool hits the threshold', () => {
    const calls = Array.from({ length: 10 }, () => 'search_repos')
    const result = noToolLoop(10).score(makeCtx({ toolCalls: calls }))
    expect(result).toMatchObject({ score: false, metadata: { maxFreq: 10, loopingTool: 'search_repos' } })
  })

  it('uses default threshold of 10', () => {
    const calls = Array.from({ length: 9 }, () => 'x')
    expect(noToolLoop().score(makeCtx({ toolCalls: calls }))).toMatchObject({ score: true })
    const calls10 = Array.from({ length: 10 }, () => 'x')
    expect(noToolLoop().score(makeCtx({ toolCalls: calls10 }))).toMatchObject({ score: false })
  })
})

describe('minCacheHitRate', () => {
  it('passes when hit rate >= target', () => {
    // cacheRead=300, input=1000 → 30%
    const result = minCacheHitRate(0.2).score(makeCtx({ cacheReadTokens: 300, inputTokens: 1000 }))
    expect(result).toMatchObject({ score: true })
  })

  it('fails when hit rate < target', () => {
    const result = minCacheHitRate(0.5).score(makeCtx({ cacheReadTokens: 300, inputTokens: 1000 }))
    expect(result).toMatchObject({ score: false })
  })

  it('returns 0 hit rate when no input tokens', () => {
    const result = minCacheHitRate(0.1).score(makeCtx({ cacheReadTokens: 0, inputTokens: 0 }))
    expect(result).toMatchObject({ score: false })
  })
})

describe('finishesCleanly', () => {
  it('passes when finishReason is stop', () => {
    expect(finishesCleanly.score(makeCtx({ finishReason: 'stop' }))).toMatchObject({ score: true })
  })

  it('fails when finishReason is error', () => {
    expect(finishesCleanly.score(makeCtx({ finishReason: 'error' }))).toMatchObject({ score: false })
  })

  it('fails when finishReason is tool-calls (still waiting)', () => {
    expect(finishesCleanly.score(makeCtx({ finishReason: 'tool-calls' }))).toMatchObject({ score: false })
  })

  it('fails when finishReason is max-tokens', () => {
    expect(finishesCleanly.score(makeCtx({ finishReason: 'max-tokens' }))).toMatchObject({ score: false })
  })
})

describe('maxCost', () => {
  it('passes when cost <= limit', () => {
    const result = maxCost(0.01).score(makeCtx({ estimatedCost: 0.005 }))
    expect(result).toMatchObject({ score: true, metadata: { cost: 0.005 } })
  })

  it('fails when cost > limit', () => {
    const result = maxCost(0.003).score(makeCtx({ estimatedCost: 0.005 }))
    expect(result).toMatchObject({ score: false })
  })

  it('passes with note when estimatedCost is undefined', () => {
    const result = maxCost(0.01).score(makeCtx({ estimatedCost: undefined }))
    expect(result).toMatchObject({ score: true })
    expect(result).toMatchObject({ metadata: { note: expect.stringContaining('estimatedCost not available') } })
  })
})

describe('maxLatency', () => {
  it('passes when duration <= limit', () => {
    const result = maxLatency(2000).score(makeCtx({ totalDurationMs: 1500 }))
    expect(result).toMatchObject({ score: true })
  })

  it('fails when duration > limit', () => {
    const result = maxLatency(1000).score(makeCtx({ totalDurationMs: 1500 }))
    expect(result).toMatchObject({ score: false })
  })

  it('passes with note when duration is not captured', () => {
    const result = maxLatency(1000).score(makeCtx({ totalDurationMs: undefined, msToFinish: undefined }))
    expect(result).toMatchObject({ score: true })
  })
})

describe('maxTokensPerStep', () => {
  it('passes when tokens/step <= limit', () => {
    // 1200 tokens / 3 steps = 400 per step
    const result = maxTokensPerStep(500).score(makeCtx({ totalTokens: 1200, steps: 3 }))
    expect(result).toMatchObject({ score: true, metadata: { perStep: 400 } })
  })

  it('fails when tokens/step > limit', () => {
    const result = maxTokensPerStep(300).score(makeCtx({ totalTokens: 1200, steps: 3 }))
    expect(result).toMatchObject({ score: false })
  })
})

describe('minThroughput', () => {
  it('passes when tokensPerSecond >= limit', () => {
    const result = minThroughput(50).score(makeCtx({ tokensPerSecond: 80 }))
    expect(result).toMatchObject({ score: true })
  })

  it('fails when tokensPerSecond < limit', () => {
    const result = minThroughput(100).score(makeCtx({ tokensPerSecond: 80 }))
    expect(result).toMatchObject({ score: false })
  })

  it('passes with note for non-streaming tasks', () => {
    const result = minThroughput(50).score(makeCtx({ tokensPerSecond: undefined }))
    expect(result).toMatchObject({ score: true })
  })
})
