// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initLog, log } from '../src/runtime/client/log'

describe('client console option', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('outputs to console by default', () => {
    initLog({ enabled: true, pretty: false })

    log.info({ action: 'test' })

    expect(infoSpy).toHaveBeenCalledTimes(1)
  })

  it('suppresses console output when console is false', () => {
    initLog({ enabled: true, console: false, pretty: false })

    log.info({ action: 'test' })
    log.error({ action: 'test' })
    log.warn({ action: 'test' })

    expect(infoSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('still sends to transport when console is false', () => {
    initLog({
      enabled: true,
      console: false,
      pretty: false,
      transport: { enabled: true, endpoint: '/api/_evlog/ingest' },
    })

    log.info({ action: 'test' })

    expect(infoSpy).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('suppresses pretty console output when console is false', () => {
    initLog({ enabled: true, console: false, pretty: true })

    log.info({ action: 'test' })

    expect(infoSpy).not.toHaveBeenCalled()
    expect(console.log).not.toHaveBeenCalled()
  })

  it('suppresses tagged logs in pretty mode when console is false', () => {
    initLog({
      enabled: true,
      console: false,
      pretty: true,
      transport: { enabled: true, endpoint: '/api/_evlog/ingest' },
    })

    log.info('auth', 'User logged in')

    expect(infoSpy).not.toHaveBeenCalled()
    expect(console.log).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('stops everything when enabled is false (regardless of console)', () => {
    initLog({
      enabled: false,
      console: true,
      pretty: false,
      transport: { enabled: true, endpoint: '/api/_evlog/ingest' },
    })

    log.info({ action: 'test' })

    expect(infoSpy).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('restores console output when console is set back to true', () => {
    initLog({ enabled: true, console: false, pretty: false })
    log.info({ action: 'silent' })
    expect(infoSpy).not.toHaveBeenCalled()

    initLog({ enabled: true, console: true, pretty: false })
    log.info({ action: 'visible' })
    expect(infoSpy).toHaveBeenCalledTimes(1)
  })
})
