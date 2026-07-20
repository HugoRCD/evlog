import { describe, expect, it } from 'vitest'
import { isPackagedCli, resolveCliEnvironment } from '../src/lib/environment'

describe('isPackagedCli', () => {
  it('treats node_modules installs as packaged', () => {
    expect(isPackagedCli('file:///tmp/node_modules/@evlog/cli/dist/index.mjs')).toBe(true)
    expect(isPackagedCli('file:///Users/x/.pnpm/@evlog+cli@1.0.0/node_modules/@evlog/cli/dist/x.mjs')).toBe(true)
  })

  it('treats monorepo packages/cli as workspace', () => {
    expect(isPackagedCli('file:///Users/hugorichard/Dev/evlog/packages/cli/src/lib/environment.ts')).toBe(false)
    expect(isPackagedCli('file:///Users/hugorichard/Dev/evlog/packages/cli/dist/index.mjs')).toBe(false)
  })
})

describe('resolveCliEnvironment', () => {
  const workspace = 'file:///repo/packages/cli/dist/index.mjs'
  const packaged = 'file:///repo/node_modules/@evlog/cli/dist/index.mjs'

  it('honors EVLOG_CLI_ENV over everything', () => {
    expect(resolveCliEnvironment({
      env: { EVLOG_CLI_ENV: 'preview', VERCEL_ENV: 'production', NODE_ENV: 'development' },
      moduleUrl: packaged,
    })).toBe('preview')
  })

  it('honors VERCEL_ENV when set', () => {
    expect(resolveCliEnvironment({
      env: { VERCEL_ENV: 'preview' },
      moduleUrl: packaged,
    })).toBe('preview')
  })

  it('reports production for packaged installs', () => {
    expect(resolveCliEnvironment({
      env: {},
      moduleUrl: packaged,
    })).toBe('production')
  })

  it('reports development for workspace builds by default', () => {
    expect(resolveCliEnvironment({
      env: {},
      moduleUrl: workspace,
    })).toBe('development')
  })

  it('uses NODE_ENV in workspace when set', () => {
    expect(resolveCliEnvironment({
      env: { NODE_ENV: 'test' },
      moduleUrl: workspace,
    })).toBe('test')
  })
})
