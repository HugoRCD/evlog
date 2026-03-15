import { parse } from 'acorn'
import { describe, expect, it } from 'vitest'
import { createStripPlugin } from '../../src/vite/strip'

function createTransformContext() {
  return {
    parse(code: string) {
      return parse(code, { ecmaVersion: 'latest', sourceType: 'module' })
    },
  }
}

function stripTransform(code: string, levels: string[], id = 'src/app.ts') {
  const plugin = createStripPlugin(levels as any)
  const { configResolved } = (plugin as any)
  if (configResolved) configResolved({ command: 'build' })
  const ctx = createTransformContext()
  const t = (plugin as any).transform
  const handler = typeof t === 'function' ? t : t.handler
  return handler.call(ctx, code, id)
}

describe('vite strip plugin', () => {
  it('removes log.debug() expression statements', () => {
    const code = `log.debug('cache', 'hit')\nconst x = 1`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).not.toContain('log.debug')
    expect(result.code).toContain('const x = 1')
  })

  it('removes log.debug() with object argument', () => {
    const code = `log.debug({ action: 'cache_hit', ratio: 0.95 })\nconst x = 1`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).not.toContain('log.debug')
    expect(result.code).toContain('const x = 1')
  })

  it('replaces log.debug() in assignment with void 0', () => {
    const code = `const x = log.debug('test', 'msg')`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).toContain('void 0')
    expect(result.code).not.toContain('log.debug')
  })

  it('does not strip levels not in the list', () => {
    const code = `log.info('app', 'started')\nlog.debug('cache', 'miss')`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).toContain('log.info')
    expect(result.code).not.toContain('log.debug')
  })

  it('strips multiple levels', () => {
    const code = `log.debug('a', 'b')\nlog.info('c', 'd')\nlog.warn('e', 'f')`
    const result = stripTransform(code, ['debug', 'info'])
    expect(result).toBeTruthy()
    expect(result.code).not.toContain('log.debug')
    expect(result.code).not.toContain('log.info')
    expect(result.code).toContain('log.warn')
  })

  it('returns undefined when no matching calls found', () => {
    const code = `log.info('app', 'started')\nconst x = 1`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeUndefined()
  })

  it('skips node_modules files', () => {
    const code = `log.debug('test', 'msg')`
    const result = stripTransform(code, ['debug'], 'node_modules/lib/index.js')
    expect(result).toBeUndefined()
  })

  it('skips virtual modules', () => {
    const code = `log.debug('test', 'msg')`
    const result = stripTransform(code, ['debug'], '\0virtual:something')
    expect(result).toBeUndefined()
  })

  it('handles empty levels array', () => {
    const plugin = createStripPlugin([])
    expect((plugin as any).transform).toBeUndefined()
  })

  it('preserves surrounding code', () => {
    const code = `const a = 1\nlog.debug('x', 'y')\nconst b = 2`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).toContain('const a = 1')
    expect(result.code).toContain('const b = 2')
    expect(result.code).not.toContain('log.debug')
  })

  it('generates sourcemap', () => {
    const code = `log.debug('test', 'msg')\nconst x = 1`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.map).toBeTruthy()
  })

  it('does not strip in dev mode', () => {
    const plugin = createStripPlugin(['debug'] as any)
    const { configResolved } = (plugin as any)
    configResolved({ command: 'serve' })
    const ctx = createTransformContext()
    const code = `log.debug('test', 'msg')\nconst x = 1`
    const { handler } = (plugin as any).transform
    const result = handler.call(ctx, code, 'src/app.ts')
    expect(result).toBeUndefined()
  })

  it('replaces log.debug() in ternary with void 0', () => {
    const code = `const x = cond ? log.debug('a') : 'fallback'`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).toContain('void 0')
    expect(result.code).not.toContain('log.debug')
    expect(result.code).toContain('\'fallback\'')
  })

  it('replaces log.debug() in comma expression with void 0', () => {
    const code = `const x = (log.debug('a'), 42)`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).toContain('void 0')
    expect(result.code).toContain('42')
    expect(result.code).not.toContain('log.debug')
  })

  it('replaces log.debug() in return statement with void 0', () => {
    const code = `function foo() { return log.debug('x') }`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).toContain('return void 0')
    expect(result.code).not.toContain('log.debug')
  })

  it('replaces log.debug() in arrow function body with void 0', () => {
    const code = `const fn = () => log.debug('x')`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).toContain('void 0')
    expect(result.code).not.toContain('log.debug')
  })

  it('replaces log.debug() as function argument with void 0', () => {
    const code = `foo(log.debug('x'))`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).toContain('foo(void 0)')
    expect(result.code).not.toContain('log.debug')
  })

  it('replaces log.debug() in braceless if body with empty statement', () => {
    const code = `if (cond) log.debug('x')\nconst y = 1`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).toContain('if (cond) ;')
    expect(result.code).toContain('const y = 1')
    expect(result.code).not.toContain('log.debug')
  })

  it('replaces log.debug() in braceless while body with empty statement', () => {
    const code = `while (running) log.debug('tick')`
    const result = stripTransform(code, ['debug'])
    expect(result).toBeTruthy()
    expect(result.code).toContain('while (running) ;')
    expect(result.code).not.toContain('log.debug')
  })
})
