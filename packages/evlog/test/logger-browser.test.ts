import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/utils')>()
  return {
    ...original,
    isClient: () => true,
  }
})

// eslint-disable-next-line import/first -- Must import after vi.mock
import { createRequestLogger, initLogger, log } from '../src/logger'

describe('browser pretty printing', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    initLogger({ pretty: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses %c CSS formatting for tagged logs instead of ANSI codes', () => {
    log.info('auth', 'User logged in')

    expect(logSpy).toHaveBeenCalledTimes(1)
    const [format, ...styles] = logSpy.mock.calls[0]!

    expect(format).toContain('%c')
    expect(format).toContain('[auth]')
    expect(format).toContain('User logged in')
    expect(format).not.toContain('\x1B')

    expect(styles.length).toBeGreaterThanOrEqual(2)
    for (const style of styles) {
      expect(style).toMatch(/^color:|^font-weight:/)
    }
  })

  it('uses %c CSS formatting for wide event pretty print', () => {
    const logger = createRequestLogger({ method: 'GET', path: '/api/test' })
    logger.set({ user: { id: '123' } })
    logger.emit()

    expect(logSpy).toHaveBeenCalled()

    const headerCall = logSpy.mock.calls[0]!
    const [headerFormat] = headerCall
    expect(headerFormat).toContain('%c')
    expect(headerFormat).not.toContain('\x1B')
  })

  it('renders tree branches with CSS in browser mode', () => {
    const logger = createRequestLogger({ method: 'POST', path: '/api/checkout' })
    logger.set({ user: { id: '123' } })
    logger.set({ cart: { items: 3 } })
    logger.emit()

    const treeCalls = logSpy.mock.calls.slice(1)
    expect(treeCalls.length).toBeGreaterThanOrEqual(1)

    for (const call of treeCalls) {
      const [format] = call
      expect(format).toContain('%c')
      expect(format).not.toContain('\x1B')
    }
  })

  it('shows status with CSS color in browser mode', () => {
    const logger = createRequestLogger({ method: 'GET', path: '/api/test' })
    logger.set({ status: 500 })
    logger.emit()

    const headerCall = logSpy.mock.calls[0]!
    const [headerFormat, ...styles] = headerCall
    expect(headerFormat).toContain('500')
    expect(headerFormat).toContain('%c')
    expect(styles.some((s: string) => s.includes('#ef4444'))).toBe(true)
  })

  it('shows duration with CSS dim in browser mode', () => {
    const logger = createRequestLogger({})
    logger.emit()

    const headerCall = logSpy.mock.calls[0]!
    const [headerFormat, ...styles] = headerCall
    expect(headerFormat).toContain('in ')
    expect(styles.some((s: string) => s.includes('#6b7280'))).toBe(true)
  })
})
