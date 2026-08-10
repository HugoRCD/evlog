import type { DrainContext } from 'evlog'
import { describe, expect, it, vi } from 'vitest'
import { createFanOutDrain } from './drains'

const context = (path: string) => ({
  event: { timestamp: '2026-08-10T12:00:00.000Z', level: 'info', service: 'evi', environment: 'test', path },
}) as DrainContext

/** Batches of one flush on push, so a run settles without waiting on a timer. */
const immediate = { batch: { size: 1, intervalMs: 1 }, retry: { maxAttempts: 1 } }

describe('createFanOutDrain', () => {
  it('returns undefined when there is no destination', () => {
    expect(createFanOutDrain([])).toBeUndefined()
  })

  it('delivers the event to every destination', async () => {
    const first = vi.fn()
    const second = vi.fn()

    createFanOutDrain([first, second], immediate)!(context('/a'))
    await vi.waitFor(() => {
      expect(first).toHaveBeenCalledTimes(1)
      expect(second).toHaveBeenCalledTimes(1)
    })
    expect(first.mock.calls[0]![0]).toEqual([context('/a')])
  })

  it('reports a rejected send to onDropped instead of swallowing it', async () => {
    const onDropped = vi.fn()
    const failing = vi.fn().mockRejectedValue(new Error('posthog down'))

    createFanOutDrain([failing], { ...immediate, onDropped })!(context('/a'))

    await vi.waitFor(() => expect(onDropped).toHaveBeenCalledTimes(1))
    expect(onDropped.mock.calls[0]![1]).toBeInstanceOf(Error)
  })

  it('keeps a healthy destination delivering when another one fails', async () => {
    const healthy = vi.fn()
    const failing = vi.fn().mockRejectedValue(new Error('posthog down'))

    createFanOutDrain([failing, healthy], immediate)!(context('/a'))

    await vi.waitFor(() => expect(healthy).toHaveBeenCalledTimes(1))
    expect(failing).toHaveBeenCalledTimes(1)
  })
})
