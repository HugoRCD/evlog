import { describe, expect, it } from 'vitest'
import { admit, contentHash, MemoryRejected, normalizeText } from './policy'
import { MAX_MEMORY_TEXT_LENGTH } from './types'

describe('normalizeText', () => {
  it('collapses whitespace so one fact has one shape', () => {
    expect(normalizeText('  a\n\n  b\tc  ')).toBe('a b c')
  })
})

describe('contentHash', () => {
  it('matches the same fact restated with different spacing or case', () => {
    expect(contentHash('Hugo prefers short PR bodies'))
      .toBe(contentHash('  hugo  prefers   SHORT pr bodies '))
  })

  it('separates different facts', () => {
    expect(contentHash('a')).not.toBe(contentHash('b'))
  })
})

describe('admit', () => {
  it('returns the normalized fact and its hash', () => {
    const admitted = admit({ text: '  Prefers   tabs ', title: '  Editor  ' })
    expect(admitted).toMatchObject({ text: 'Prefers tabs', title: 'Editor' })
    expect(admitted.contentHash).toBe(contentHash('Prefers tabs'))
  })

  it('rejects an empty fact', () => {
    expect(() => admit({ text: '   ' })).toThrow(MemoryRejected)
  })

  it('rejects a fact longer than the cap', () => {
    expect(() => admit({ text: 'x'.repeat(MAX_MEMORY_TEXT_LENGTH + 1) }))
      .toThrow(/is a document/)
  })

  it.each([
    ['an OpenAI-shaped key', 'the key is sk-abcdefghijklmnopqrstuvwxyz012345'],
    ['a GitHub token', 'use ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    ['a Vercel token', 'token vc_abcdefghijklmnopqrstuvwxyz01'],
    ['a Postgres URL with a password', 'db at postgresql://user:hunter2@host/db'],
    ['a JWT', 'bearer eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4'],
    ['a private key', '-----BEGIN RSA PRIVATE KEY-----'],
  ])('refuses %s', (_label, text) => {
    expect(() => admit({ text })).toThrow(/credential/)
  })

  it('refuses a credential hidden in the title', () => {
    expect(() => admit({ text: 'harmless', title: 'ghp_abcdefghijklmnopqrstuvwxyz0123456789' }))
      .toThrow(/credential/)
  })

  it('carries the reason on the error so the tool can report it', () => {
    expect.assertions(1)
    try {
      admit({ text: '' })
    }
    catch (error) {
      expect((error as MemoryRejected).reason).toBe('empty')
    }
  })
})
