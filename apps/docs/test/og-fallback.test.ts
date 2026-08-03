import { describe, expect, it } from 'vitest'
import { shouldFallbackToStaticOgImage } from '../server/utils/og-fallback'

const runtime = { dev: false, prerender: false }

describe('shouldFallbackToStaticOgImage', () => {
  it('redirects a missing static OG asset at runtime', () => {
    expect(shouldFallbackToStaticOgImage('/_og/s/o_dabn1k.png', runtime)).toBe(true)
  })

  it('ignores the query string when matching', () => {
    expect(shouldFallbackToStaticOgImage('/_og/s/o_dabn1k.png?v=2', runtime)).toBe(true)
  })

  it('leaves non-OG routes alone', () => {
    expect(shouldFallbackToStaticOgImage('/use-cases/telemetry/overview', runtime)).toBe(false)
    expect(shouldFallbackToStaticOgImage('/og.png', runtime)).toBe(false)
  })

  it('never redirects during prerender', () => {
    expect(shouldFallbackToStaticOgImage('/_og/s/o_dabn1k.png', { dev: false, prerender: true })).toBe(false)
  })

  it('never redirects in dev', () => {
    expect(shouldFallbackToStaticOgImage('/_og/s/o_dabn1k.png', { dev: true, prerender: false })).toBe(false)
  })
})
