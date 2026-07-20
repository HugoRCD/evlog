import { afterEach, describe, expect, it } from 'vitest'
import { buildEnvInfo, resolveEnvironment } from '../src/enrich'

describe('resolveEnvironment', () => {
  afterEach(() => {
    delete process.env.EVLOG_TELEMETRY_ENV
    delete process.env.VERCEL_ENV
  })

  it('honors EVLOG_TELEMETRY_ENV then VERCEL_ENV then override then NODE_ENV', () => {
    expect(resolveEnvironment({
      env: { EVLOG_TELEMETRY_ENV: 'staging', VERCEL_ENV: 'preview', NODE_ENV: 'production' },
      override: 'development',
    })).toBe('staging')

    expect(resolveEnvironment({
      env: { VERCEL_ENV: 'preview', NODE_ENV: 'production' },
      override: 'development',
    })).toBe('preview')

    expect(resolveEnvironment({
      env: { NODE_ENV: 'test' },
      override: 'production',
    })).toBe('production')

    expect(resolveEnvironment({
      env: { NODE_ENV: 'test' },
    })).toBe('test')
  })

  it('defaults to development', () => {
    expect(resolveEnvironment({ env: {} })).toBe('development')
  })
})

describe('buildEnvInfo', () => {
  it('includes environment', () => {
    const info = buildEnvInfo({ environment: 'production' })
    expect(info.environment).toBe('production')
    expect(typeof info.node).toBe('string')
    expect(typeof info.ci).toBe('boolean')
  })
})
