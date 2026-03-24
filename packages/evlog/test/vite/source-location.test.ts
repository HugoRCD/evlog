import { parse } from 'acorn'
import { describe, expect, it } from 'vitest'
import { createSourceLocationPlugin } from '../../src/vite/source-location'

function createTransformContext() {
  return {
    parse(code: string) {
      return parse(code, { ecmaVersion: 'latest', sourceType: 'module' })
    },
  }
}

function sourceLocationTransform(code: string, id = '/project/src/app.ts', root = '/project') {
  const plugin = createSourceLocationPlugin(true)
  const { configResolved } = (plugin as any)
  configResolved({ command: 'serve', root })

  const ctx = createTransformContext()
  const t = (plugin as any).transform
  const handler = typeof t === 'function' ? t : t.handler
  return handler.call(ctx, code, id)
}

describe('vite source-location plugin', () => {
  it('injects __source into object-form log calls', () => {
    const code = `log.info({ action: 'login' })`
    const result = sourceLocationTransform(code)
    expect(result).toBeTruthy()
    expect(result.code).toContain('__source')
    expect(result.code).toContain('src/app.ts:1')
  })

  it('handles objects with multiple properties', () => {
    const code = `log.error({ action: 'payment', error: 'declined' })`
    const result = sourceLocationTransform(code)
    expect(result).toBeTruthy()
    expect(result.code).toContain('__source')
    expect(result.code).toContain('action')
    expect(result.code).toContain('error')
  })

  it('does not transform tag-form log calls', () => {
    const code = `log.info('auth', 'User logged in')`
    const result = sourceLocationTransform(code)
    expect(result).toBeUndefined()
  })

  it('tracks correct line numbers', () => {
    const code = `const x = 1\nconst y = 2\nlog.info({ action: 'test' })`
    const result = sourceLocationTransform(code)
    expect(result).toBeTruthy()
    expect(result.code).toContain('src/app.ts:3')
  })

  it('handles all log levels', () => {
    const levels = ['info', 'error', 'warn', 'debug']
    for (const level of levels) {
      const code = `log.${level}({ action: 'test' })`
      const result = sourceLocationTransform(code)
      expect(result).toBeTruthy()
      expect(result.code).toContain('__source')
    }
  })

  it('skips node_modules', () => {
    const code = `log.info({ action: 'test' })`
    const result = sourceLocationTransform(code, '/project/node_modules/lib/index.js')
    expect(result).toBeUndefined()
  })

  it('generates sourcemap', () => {
    const code = `log.info({ action: 'test' })`
    const result = sourceLocationTransform(code)
    expect(result).toBeTruthy()
    expect(result.map).toBeTruthy()
  })

  it('does not activate when disabled', () => {
    const plugin = createSourceLocationPlugin(false)
    const { configResolved } = (plugin as any)
    configResolved({ command: 'serve', root: '/project' })

    const ctx = createTransformContext()
    const code = `log.info({ action: 'test' })`
    const { handler } = (plugin as any).transform
    const result = handler.call(ctx, code, '/project/src/app.ts')
    expect(result).toBeUndefined()
  })

  it('uses relative path from root', () => {
    const code = `log.info({ action: 'test' })`
    const result = sourceLocationTransform(code, '/my/project/src/routes/checkout.ts', '/my/project')
    expect(result).toBeTruthy()
    expect(result.code).toContain('src/routes/checkout.ts:1')
  })

  it('injects into empty object', () => {
    const code = `log.info({})`
    const result = sourceLocationTransform(code)
    expect(result).toBeTruthy()
    expect(result.code).toContain('__source')
    expect(result.code).toContain('src/app.ts:1')
  })

  it('injects into multiline object', () => {
    const code = `log.info({\n  action: 'login',\n  user: 'alice'\n})`
    const result = sourceLocationTransform(code)
    expect(result).toBeTruthy()
    expect(result.code).toContain('__source')
  })

  it('injects into object with trailing comma', () => {
    const code = `log.info({ action: 'login', })`
    const result = sourceLocationTransform(code)
    expect(result).toBeTruthy()
    expect(result.code).toContain('__source')
  })

  it('injects into object with nested objects', () => {
    const code = `log.info({ user: { id: 1, name: 'alice' } })`
    const result = sourceLocationTransform(code)
    expect(result).toBeTruthy()
    expect(result.code).toContain('__source')
    expect(result.code).toContain('user')
  })

  it('skips object that already has __source', () => {
    const code = `log.info({ __source: 'custom', action: 'test' })`
    const result = sourceLocationTransform(code)
    expect(result).toBeUndefined()
  })

  it('uses JSON.stringify for path escaping', () => {
    const code = `log.info({ action: 'test' })`
    const result = sourceLocationTransform(code)
    expect(result).toBeTruthy()
    expect(result.code).toContain('__source: "src/app.ts:1"')
  })

  it('defaults to dev-only when enabled is undefined', () => {
    const plugin = createSourceLocationPlugin()

    const { configResolved } = (plugin as any)
    configResolved({ command: 'serve', root: '/project' })
    const ctx = createTransformContext()
    const code = `log.info({ action: 'test' })`
    const { handler } = (plugin as any).transform
    const devResult = handler.call(ctx, code, '/project/src/app.ts')
    expect(devResult).toBeTruthy()

    configResolved({ command: 'build', root: '/project' })
    const buildResult = handler.call(ctx, code, '/project/src/app.ts')
    expect(buildResult).toBeUndefined()
  })
})
