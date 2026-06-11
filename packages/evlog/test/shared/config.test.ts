import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyDeprecatedAlias, formatPublicEnvKeys } from '../../src/shared/config'

describe('formatPublicEnvKeys', () => {
  it('drops NUXT_* aliases and keeps canonical names', () => {
    expect(formatPublicEnvKeys(['NUXT_BETTER_STACK_API_KEY', 'BETTER_STACK_API_KEY']))
      .toBe('BETTER_STACK_API_KEY')
  })

  it('joins alternatives with commas and required fields with slashes', () => {
    expect(formatPublicEnvKeys(
      ['NUXT_AXIOM_API_KEY', 'AXIOM_API_KEY'],
      ['NUXT_AXIOM_DATASET', 'AXIOM_DATASET'],
    )).toBe('AXIOM_API_KEY/AXIOM_DATASET')
  })

  it('lists multiple aliases for the same field', () => {
    expect(formatPublicEnvKeys(['NUXT_DATADOG_API_KEY', 'DATADOG_API_KEY', 'DD_API_KEY']))
      .toBe('DATADOG_API_KEY, DD_API_KEY')
  })

  it('falls back to NUXT_* when no public keys exist', () => {
    expect(formatPublicEnvKeys(['NUXT_ONLY_KEY']))
      .toBe('NUXT_ONLY_KEY')
  })
})

describe('applyDeprecatedAlias', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns with canonical env var names only', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    applyDeprecatedAlias(
      { sourceToken: 'legacy' },
      {
        adapter: 'test-config-warn',
        from: 'sourceToken',
        to: 'apiKey',
        fromEnv: ['NUXT_BETTER_STACK_SOURCE_TOKEN', 'BETTER_STACK_SOURCE_TOKEN'],
        toEnv: ['NUXT_BETTER_STACK_API_KEY', 'BETTER_STACK_API_KEY'],
      },
    )
    expect(warnSpy).toHaveBeenCalledWith(
      '[evlog/test-config-warn] `sourceToken` is deprecated, use `apiKey` instead. (Env: BETTER_STACK_SOURCE_TOKEN → BETTER_STACK_API_KEY)',
    )
  })

  it('copies the deprecated value onto the replacement', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = applyDeprecatedAlias(
      { token: 'xaat-legacy' },
      {
        adapter: 'test-config-copy',
        from: 'token',
        to: 'apiKey',
        fromEnv: ['NUXT_AXIOM_TOKEN', 'AXIOM_TOKEN'],
        toEnv: ['NUXT_AXIOM_API_KEY', 'AXIOM_API_KEY'],
      },
    )
    expect(result).toEqual({ token: 'xaat-legacy', apiKey: 'xaat-legacy' })
  })

  it('warns only once per adapter/field pair', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const opts = {
      adapter: 'test-config-once',
      from: 'sourceToken' as const,
      to: 'apiKey' as const,
      fromEnv: ['BETTER_STACK_SOURCE_TOKEN'],
      toEnv: ['BETTER_STACK_API_KEY'],
    }
    applyDeprecatedAlias({ sourceToken: 'a' }, opts)
    applyDeprecatedAlias({ sourceToken: 'b' }, opts)
    expect(warnSpy).toHaveBeenCalledOnce()
  })
})
