import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { RequestLogger } from '../src/types'
import { createRequestLogger, initLogger } from '../src/logger'
import { attachForkToLogger, forkBackgroundLogger } from '../src/shared/fork'

describe('forkBackgroundLogger', () => {
  const storage = new AsyncLocalStorage<RequestLogger>()

  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    initLogger({ pretty: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when parent has no requestId', () => {
    const parent = createRequestLogger({
      method: 'GET',
      path: '/a',
    })

    expect(() =>
      forkBackgroundLogger({
        storage,
        parent,
        middlewareOptions: {
          method: 'GET',
          path: '/a',
        },
        label: 'op',
        fn: () => {},
      }),
    ).toThrow(/requestId/)
  })

  it('emits child wide event with operation and _parentRequestId', async () => {
    const drained: unknown[] = []
    initLogger({
      pretty: false,
      drain: ({ event }) => {
        drained.push(event)
      },
    })

    const parent = createRequestLogger({
      method: 'GET',
      path: '/checkout',
      requestId: 'parent-req-id',
    })

    attachForkToLogger(storage, parent, {
      method: 'GET',
      path: '/checkout',
      requestId: 'parent-req-id',
    })

    storage.run(parent, () => {
      parent.fork!('bg_task', () => {
        const log = storage.getStore()!
        log.set({ step: 'done' })
      })
    })

    parent.emit()

    await vi.waitFor(() => {
      expect(drained.length).toBeGreaterThanOrEqual(2)
    })

    const childEvents = drained.filter(
      (e: unknown) => typeof e === 'object' && e !== null && (e as Record<string, unknown>).operation === 'bg_task',
    )
    expect(childEvents.length).toBeGreaterThanOrEqual(1)
    expect(childEvents[0]).toMatchObject({
      operation: 'bg_task',
      _parentRequestId: 'parent-req-id',
      step: 'done',
    })
  })

  it('does not console.warn on child log.set before child emit', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const parent = createRequestLogger({
      method: 'POST',
      path: '/api',
      requestId: 'p-1',
    })

    attachForkToLogger(storage, parent, {
      method: 'POST',
      path: '/api',
      requestId: 'p-1',
    })

    storage.run(parent, () => {
      parent.fork!('job', () => {
        const log = storage.getStore()!
        log.set({ ok: true })
      })
    })

    parent.emit()

    await vi.waitFor(() => {
      const setWarns = warnSpy.mock.calls.filter(c => String(c[0]).includes('log.set()'))
      expect(setWarns.length).toBe(0)
    })
  })
})
