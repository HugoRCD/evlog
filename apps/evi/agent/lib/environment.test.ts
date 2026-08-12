import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { environment } from './environment'

const EVE = 'EVE_RUN_MODE'
const VERCEL = 'VERCEL_ENV'

describe('environment', () => {
  beforeEach(() => {
    delete process.env[EVE]
    delete process.env[VERCEL]
  })

  afterEach(() => {
    delete process.env[EVE]
    delete process.env[VERCEL]
  })

  it('labels eval runs as eval over any Vercel env', () => {
    process.env[EVE] = 'eval'
    process.env[VERCEL] = 'production'
    expect(environment()).toBe('eval')
  })

  it('falls back to VERCEL_ENV', () => {
    process.env[VERCEL] = 'preview'
    expect(environment()).toBe('preview')
  })

  it('defaults to local', () => {
    expect(environment()).toBe('local')
  })
})
