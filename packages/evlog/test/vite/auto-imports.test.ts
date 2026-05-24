import { describe, expect, it } from 'vitest'
import { defined } from '../helpers/defined'
import { runPluginTransform } from '../helpers/vite'
import { createAutoImportsPlugin } from '../../src/vite/auto-imports'

function autoImportTransform(code: string, id = 'src/app.ts', options = {}) {
  const plugin = createAutoImportsPlugin(options)
  return runPluginTransform(plugin, code, id)
}

describe('vite auto-imports plugin', () => {
  it('adds import for log when log.info() is used', () => {
    const code = `log.info('auth', 'User logged in')`
    const result = defined(autoImportTransform(code), 'auto-import result')
    expect(result.code).toContain('import { log } from \'evlog\'')
  })

  it('adds import for log when log.error() is used', () => {
    const code = `log.error({ action: 'payment', error: 'declined' })`
    const result = defined(autoImportTransform(code), 'auto-import result')
    expect(result.code).toContain('import { log } from \'evlog\'')
  })

  it('adds import for createEvlogError when called', () => {
    const code = `throw createEvlogError({ message: 'test', status: 400 })`
    const result = defined(autoImportTransform(code), 'auto-import result')
    expect(result.code).toContain('import { createEvlogError } from \'evlog\'')
  })

  it('adds import for parseError when called', () => {
    const code = `const err = parseError(caught)`
    const result = defined(autoImportTransform(code), 'auto-import result')
    expect(result.code).toContain('import { parseError } from \'evlog\'')
  })

  it('does not add import if already imported from evlog', () => {
    const code = `import { log } from 'evlog'\nlog.info('test', 'msg')`
    const result = autoImportTransform(code)
    expect(result).toBeUndefined()
  })

  it('does not add import if already imported from #imports', () => {
    const code = `import { log } from '#imports'\nlog.info('test', 'msg')`
    const result = autoImportTransform(code)
    expect(result).toBeUndefined()
  })

  it('does not add import for locally declared log variable', () => {
    const code = `const log = console\nlog.info('test')`
    const result = autoImportTransform(code)
    expect(result).toBeUndefined()
  })

  it('does not add import for imported log from other library', () => {
    const code = `import { log } from 'other-lib'\nlog.info('test')`
    const result = autoImportTransform(code)
    expect(result).toBeUndefined()
  })

  it('adds multiple imports when needed', () => {
    const code = `log.info('test', 'msg')\nthrow createEvlogError('error')`
    const result = defined(autoImportTransform(code), 'auto-import result')
    expect(result.code).toContain('log')
    expect(result.code).toContain('createEvlogError')
  })

  it('skips node_modules files', () => {
    const code = `log.info('test', 'msg')`
    const result = autoImportTransform(code, 'node_modules/lib/index.js')
    expect(result).toBeUndefined()
  })

  it('returns undefined when no symbols are used', () => {
    const code = `const x = 1 + 2`
    const result = autoImportTransform(code)
    expect(result).toBeUndefined()
  })

  it('respects custom imports list', () => {
    const code = `log.info('test', 'msg')\nthrow createEvlogError('error')`
    const result = defined(autoImportTransform(code, 'src/app.ts', { imports: ['log'] }), 'auto-import result')
    expect(result.code).toContain('import { log } from \'evlog\'')
    expect(result.code).not.toContain('import { createEvlogError')
  })

  it('generates sourcemap', () => {
    const code = `log.info('test', 'msg')`
    const result = defined(autoImportTransform(code), 'auto-import result')
    expect(result.map).toBeTruthy()
  })

  it('adds import for setIdentity from evlog/client', () => {
    const code = `setIdentity({ userId: '123' })`
    const result = defined(autoImportTransform(code, 'src/app.ts', {
      imports: ['setIdentity'],
    }), 'auto-import result')
    expect(result.code).toContain('import { setIdentity } from \'evlog/client\'')
  })

  it('adds import for clearIdentity from evlog/client', () => {
    const code = `clearIdentity()`
    const result = defined(autoImportTransform(code, 'src/app.ts', {
      imports: ['clearIdentity'],
    }), 'auto-import result')
    expect(result.code).toContain('import { clearIdentity } from \'evlog/client\'')
  })

  it('groups log and parseError in same evlog import', () => {
    const code = `log.info('test', 'msg')\nconst e = parseError(err)`
    const result = defined(autoImportTransform(code), 'auto-import result')
    expect(result.code).toContain('import { log, parseError } from \'evlog\'')
  })
})
