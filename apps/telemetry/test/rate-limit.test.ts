import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../server/utils/rate-limit'

describe('createRateLimiter', () => {
  it('allows requests under the limit within a window', () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 })
    const now = 0

    expect(limiter.isAllowed('ip-1', now)).toBe(true)
    expect(limiter.isAllowed('ip-1', now)).toBe(true)
    expect(limiter.isAllowed('ip-1', now)).toBe(true)
  })

  it('blocks requests once the limit is exceeded within a window', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 })
    const now = 0

    expect(limiter.isAllowed('ip-1', now)).toBe(true)
    expect(limiter.isAllowed('ip-1', now)).toBe(true)
    expect(limiter.isAllowed('ip-1', now)).toBe(false)
  })

  it('resets the count once a new window starts', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 })

    expect(limiter.isAllowed('ip-1', 0)).toBe(true)
    expect(limiter.isAllowed('ip-1', 500)).toBe(false)
    expect(limiter.isAllowed('ip-1', 1500)).toBe(true)
  })

  it('tracks separate keys independently', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 })

    expect(limiter.isAllowed('ip-1', 0)).toBe(true)
    expect(limiter.isAllowed('ip-2', 0)).toBe(true)
    expect(limiter.isAllowed('ip-1', 0)).toBe(false)
    expect(limiter.isAllowed('ip-2', 0)).toBe(false)
  })
})
