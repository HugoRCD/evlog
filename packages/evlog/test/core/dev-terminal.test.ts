import { afterEach, describe, expect, it } from 'vitest'
import {
  resolveDevTerminal,
  shouldShowFrameworkOverlay,
} from '../../src/shared/dev-terminal'
import { buildErrorEntries } from '../../src/shared/pretty-error'

const SAMPLE_STACK = `Error: Payment processing failed
    at Object.handler (file:///Users/dev/project/server/api/test.get.ts:100:0)
    at async file:///Users/dev/project/node_modules/h3/dist/index.mjs:2017:19`

describe('resolveDevTerminal', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  it('applies evlog preset — no overlay, full pretty error', () => {
    process.env.NODE_ENV = 'development'
    expect(resolveDevTerminal({ pretty: true, dev: 'evlog' })).toEqual({
      frameworkOverlay: false,
      prettyError: {
        snippet: true,
        stackDepth: 2,
        compact: true,
        detail: 'full',
      },
    })
  })

  it('applies nitro preset — overlay on, guidance-only pretty error', () => {
    process.env.NODE_ENV = 'development'
    expect(resolveDevTerminal({ pretty: true, dev: 'nitro' })).toEqual({
      frameworkOverlay: true,
      prettyError: {
        snippet: false,
        stackDepth: 0,
        compact: true,
        detail: 'guidance',
      },
    })
  })

  it('applies both preset — overlay on, full pretty error', () => {
    process.env.NODE_ENV = 'development'
    expect(resolveDevTerminal({ pretty: true, dev: 'both' })).toEqual({
      frameworkOverlay: true,
      prettyError: {
        snippet: true,
        stackDepth: 2,
        compact: true,
        detail: 'full',
      },
    })
  })

  it('ignores unknown preset strings and falls back to defaults', () => {
    process.env.NODE_ENV = 'development'
    expect(() => resolveDevTerminal({ pretty: true, dev: 'unknown' as 'evlog' })).not.toThrow()
    expect(resolveDevTerminal({ pretty: true, dev: 'unknown' as 'evlog' })).toEqual(
      resolveDevTerminal({ pretty: true }),
    )
  })
})

describe('shouldShowFrameworkOverlay', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  it('defaults to no overlay in pretty dev and allows opt-in', () => {
    process.env.NODE_ENV = 'development'
    expect(shouldShowFrameworkOverlay({ pretty: true })).toBe(false)
    expect(shouldShowFrameworkOverlay({ pretty: true, dev: 'nitro' })).toBe(true)
  })
})

describe('buildErrorEntries guidance detail', () => {
  it('omits location and stack when detail is guidance', () => {
    const entries = buildErrorEntries({
      message: 'Payment failed',
      stack: SAMPLE_STACK,
      why: 'Card declined',
      fix: 'Try another card',
      link: 'https://docs.example.com/payments',
    }, { detail: 'guidance' })

    const children = entries[0]?.children ?? []
    expect(children.some(line => line.includes('test.get.ts'))).toBe(false)
    expect(children.some(line => line.includes('hidden in node_modules'))).toBe(false)
    expect(children.some(line => line.includes('Why:'))).toBe(true)
    expect(children.some(line => line.includes('Fix:'))).toBe(true)
  })
})
