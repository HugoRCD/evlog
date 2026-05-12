import { describe, expect, it } from 'vitest'
import type { WideEvent } from 'evlog'
import { defineScorer, exactMatch, contains, matches, notEmpty, lengthBetween } from '../src/scorers/index'
import type { ScorerContext } from '../src/types'

function makeCtx(overrides: Partial<ScorerContext<string, string>> = {}): ScorerContext<string, string> {
  return {
    input: 'test input',
    output: 'test output',
    expected: undefined,
    event: { timestamp: '', level: 'info', service: 'eval', environment: 'test' } as WideEvent,
    ...overrides,
  }
}

describe('defineScorer', () => {
  it('returns the scorer as-is', () => {
    const scorer = defineScorer({ name: 'my-scorer', score: () => true })
    expect(scorer.name).toBe('my-scorer')
  })
})

describe('exactMatch', () => {
  it('passes when output equals expected', () => {
    const ctx = makeCtx({ output: 'hello', expected: 'hello' })
    expect(exactMatch.score(ctx)).toBe(true)
  })

  it('fails when output differs from expected', () => {
    const ctx = makeCtx({ output: 'hello', expected: 'world' })
    expect(exactMatch.score(ctx)).toBe(false)
  })

  it('fails when expected is undefined', () => {
    const ctx = makeCtx({ output: 'hello', expected: undefined })
    expect(exactMatch.score(ctx)).toBe(false)
  })
})

describe('contains', () => {
  it('passes when output contains the substring', () => {
    const ctx = makeCtx({ output: 'The quick brown fox' })
    expect(contains('quick').score(ctx)).toBe(true)
  })

  it('fails when output does not contain the substring', () => {
    const ctx = makeCtx({ output: 'The quick brown fox' })
    expect(contains('lazy').score(ctx)).toBe(false)
  })

  it('includes the substring in the scorer name', () => {
    expect(contains('hello').name).toBe('contains(hello)')
  })
})

describe('matches', () => {
  it('passes when output matches the pattern', () => {
    const ctx = makeCtx({ output: 'foo123' })
    expect(matches(/\d+/).score(ctx)).toBe(true)
  })

  it('fails when output does not match', () => {
    const ctx = makeCtx({ output: 'foobar' })
    expect(matches(/\d+/).score(ctx)).toBe(false)
  })
})

describe('notEmpty', () => {
  it('passes for non-empty output', () => {
    expect(notEmpty.score(makeCtx({ output: 'hello' }))).toBe(true)
  })

  it('fails for empty string', () => {
    expect(notEmpty.score(makeCtx({ output: '' }))).toBe(false)
  })

  it('fails for whitespace-only string', () => {
    expect(notEmpty.score(makeCtx({ output: '   ' }))).toBe(false)
  })
})

describe('lengthBetween', () => {
  it('passes when output length is in range', async () => {
    const result = await lengthBetween(3, 10).score(makeCtx({ output: 'hello' }))
    const score = typeof result === 'object' && 'score' in result ? result.score : result
    expect(score).toBe(true)
  })

  it('fails when output is too short', async () => {
    const result = await lengthBetween(10, 20).score(makeCtx({ output: 'hi' }))
    const score = typeof result === 'object' && 'score' in result ? result.score : result
    expect(score).toBe(false)
  })

  it('includes length metadata', async () => {
    const result = await lengthBetween(3, 10).score(makeCtx({ output: 'hello' }))
    expect(result).toMatchObject({ score: true, metadata: { length: 5, min: 3, max: 10 } })
  })
})
