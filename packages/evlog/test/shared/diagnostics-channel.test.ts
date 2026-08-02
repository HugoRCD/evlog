import { subscribe, unsubscribe } from 'node:diagnostics_channel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLogger, initLogger, log } from '../../src/logger'
import { createMiddlewareLogger } from '../../src/shared/middleware'
import { EVLOG_EVENT_CHANNEL, enableDiagnosticsChannel, subscribeToWideEvents } from '../../src/diagnostics'
import type { WideEventMessage } from '../../src/diagnostics'
import type { WideEvent } from '../../src/types'
import { registerWideEventPublisher } from '../../src/shared/wideEventChannel'
import { defined } from '../helpers/defined'

describe('evlog.event diagnostics channel', () => {
  let disable: (() => void) | undefined
  let received: WideEvent[]
  let listener: (message: unknown) => void

  beforeEach(() => {
    initLogger({ env: { service: 'test-app' }, pretty: false })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    received = []
    listener = message => received.push((message as WideEventMessage).event)
    subscribe(EVLOG_EVENT_CHANNEL, listener)
  })

  afterEach(() => {
    unsubscribe(EVLOG_EVENT_CHANNEL, listener)
    disable?.()
    disable = undefined
    initLogger({ env: { service: 'test-app' }, pretty: false })
    vi.restoreAllMocks()
  })

  it('publishes nothing until the channel is enabled', () => {
    log.info({ action: 'before_enable' })

    expect(received).toHaveLength(0)
  })

  it('publishes an event emitted outside a request', async () => {
    disable = await enableDiagnosticsChannel()

    createLogger({ action: 'cron_completed', deleted: 42 }).emit()

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ action: 'cron_completed', deleted: 42, service: 'test-app' })
  })

  it('publishes a request event after enrichers have run', async () => {
    disable = await enableDiagnosticsChannel()

    const { finish } = createMiddlewareLogger({
      method: 'POST',
      path: '/api/checkout',
      enrich: ({ event }) => {
        event.geo = { country: 'FR' }
      },
    })
    await finish({ status: 200 })

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ method: 'POST', path: '/api/checkout', status: 200, geo: { country: 'FR' } })
  })

  it('publishes a request event when no drain and no enricher are configured', async () => {
    disable = await enableDiagnosticsChannel()

    const { finish } = createMiddlewareLogger({ method: 'GET', path: '/api/users' })
    await finish({ status: 200 })

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ method: 'GET', path: '/api/users' })
  })

  it('publishes once for a request that also has a drain', async () => {
    disable = await enableDiagnosticsChannel()
    const drain = vi.fn()

    const { finish } = createMiddlewareLogger({ method: 'GET', path: '/api/users', drain })
    await finish({ status: 200 })

    expect(received).toHaveLength(1)
    expect(drain).toHaveBeenCalledTimes(1)
    expect(received[0]).toBe(defined(drain.mock.calls[0]?.[0], 'drain context').event)
  })

  it('publishes the redacted event', async () => {
    initLogger({
      env: { service: 'test-app' },
      pretty: false,
      redact: { paths: ['user.email'] },
    })
    disable = await enableDiagnosticsChannel()

    createLogger({ user: { id: 'u-1', email: 'user@example.com' } }).emit()

    expect(received).toHaveLength(1)
    expect((received[0]?.user as Record<string, unknown>).email).not.toBe('user@example.com')
  })

  it('contains a throwing publisher without breaking emit or the drain', async () => {
    registerWideEventPublisher(() => {
      throw new Error('publisher exploded')
    })
    const drain = vi.fn()

    try {
      const { finish } = createMiddlewareLogger({ method: 'GET', path: '/api/users', drain })
      const event = await finish({ status: 200 })

      expect(event).not.toBeNull()
      expect(drain).toHaveBeenCalledTimes(1)
      expect(console.error).toHaveBeenCalledWith('[evlog] diagnostics channel publish failed:', expect.any(Error))
    } finally {
      registerWideEventPublisher(null)
    }
  })

  it('stops publishing once disabled', async () => {
    const stop = await enableDiagnosticsChannel()
    stop()

    createLogger({ action: 'after_disable' }).emit()

    expect(received).toHaveLength(0)
  })

  describe('subscribeToWideEvents', () => {
    it('delivers typed events and unsubscribes', async () => {
      disable = await enableDiagnosticsChannel()
      const seen: WideEvent[] = []
      const stop = await subscribeToWideEvents(event => seen.push(event))

      createLogger({ action: 'first' }).emit()
      stop()
      createLogger({ action: 'second' }).emit()

      expect(seen).toHaveLength(1)
      expect(seen[0]).toMatchObject({ action: 'first' })
    })
  })
})
