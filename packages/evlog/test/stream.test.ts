import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStreamDrain, getDefaultStream, setDefaultStream } from '../src/stream'
import type { WideEvent } from '../src/types'
import { makeContext, makeEvent } from './helpers/events'

describe('createStreamDrain', () => {
  describe('drain', () => {
    it('accepts a single DrainContext', async () => {
      const stream = createStreamDrain()
      const listener = vi.fn()
      stream.subscribe(listener)

      await stream.drain(makeContext(makeEvent(1)))

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
    })

    it('accepts an array of DrainContexts', async () => {
      const stream = createStreamDrain()
      const listener = vi.fn()
      stream.subscribe(listener)

      await stream.drain([makeContext(makeEvent(1)), makeContext(makeEvent(2))])

      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('skips events that fail the filter', async () => {
      const stream = createStreamDrain({
        filter: event => event.level === 'error',
      })
      const listener = vi.fn()
      stream.subscribe(listener)

      await stream.drain([
        makeContext(makeEvent(1, { level: 'info' })),
        makeContext(makeEvent(2, { level: 'error' })),
      ])

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
    })
  })

  describe('subscribe', () => {
    it('returns an unsubscribe function', async () => {
      const stream = createStreamDrain()
      const listener = vi.fn()
      const unsubscribe = stream.subscribe(listener)

      await stream.drain(makeContext(makeEvent(1)))
      unsubscribe()
      await stream.drain(makeContext(makeEvent(2)))

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('isolates listener errors from siblings', async () => {
      const stream = createStreamDrain()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const goodListener = vi.fn()

      stream.subscribe(() => {
        throw new Error('boom')
      })
      stream.subscribe(goodListener)

      await stream.drain(makeContext(makeEvent(1)))

      expect(goodListener).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith('[evlog/stream] subscriber threw:', expect.any(Error))
      errorSpy.mockRestore()
    })

    it('reports subscriberCount accurately', () => {
      const stream = createStreamDrain()
      expect(stream.subscriberCount).toBe(0)

      const u1 = stream.subscribe(() => {})
      const u2 = stream.subscribe(() => {})
      expect(stream.subscriberCount).toBe(2)

      u1()
      expect(stream.subscriberCount).toBe(1)
      u2()
      expect(stream.subscriberCount).toBe(0)
    })
  })

  describe('recent', () => {
    it('keeps a ring buffer of the configured size', async () => {
      const stream = createStreamDrain({ buffer: 3 })

      for (let i = 1; i <= 5; i++) {
        await stream.drain(makeContext(makeEvent(i)))
      }

      const recent = stream.recent()
      expect(recent.map(e => e.id)).toEqual([3, 4, 5])
    })

    it('returns an empty array when buffer is disabled', async () => {
      const stream = createStreamDrain({ buffer: 0 })
      await stream.drain(makeContext(makeEvent(1)))

      expect(stream.recent()).toEqual([])
    })

    it('returns a defensive copy', async () => {
      const stream = createStreamDrain({ buffer: 5 })
      await stream.drain(makeContext(makeEvent(1)))

      const snap = stream.recent() as WideEvent[]
      snap.length = 0
      expect(stream.recent()).toHaveLength(1)
    })

    it('counts dropped events when the buffer wraps', async () => {
      const stream = createStreamDrain({ buffer: 2 })

      for (let i = 1; i <= 5; i++) {
        await stream.drain(makeContext(makeEvent(i)))
      }

      expect(stream.droppedCount).toBe(3)
    })
  })

  describe('events (async iterator)', () => {
    it('yields drained events to the consumer', async () => {
      const stream = createStreamDrain()
      const iter = stream.events()
      const collected: number[] = []

      const consumer = (async () => {
        for await (const event of iter) {
          collected.push(event.id as number)
          if (collected.length === 2) break
        }
      })()

      await stream.drain(makeContext(makeEvent(1)))
      await stream.drain(makeContext(makeEvent(2)))

      await consumer
      expect(collected).toEqual([1, 2])
    })

    it('does not replay buffered events', async () => {
      const stream = createStreamDrain()
      await stream.drain(makeContext(makeEvent(1)))

      const iter = stream.events()
      const collected: number[] = []

      const consumer = (async () => {
        for await (const event of iter) {
          collected.push(event.id as number)
          break
        }
      })()

      await stream.drain(makeContext(makeEvent(2)))
      await consumer

      expect(collected).toEqual([2])
    })

    it('cleanly unsubscribes when consumer breaks', async () => {
      const stream = createStreamDrain()
      const iter = stream.events()

      const consumer = (async () => {
        for await (const _event of iter) {
          break
        }
      })()

      await stream.drain(makeContext(makeEvent(1)))
      await consumer

      expect(stream.subscriberCount).toBe(0)
    })

    it('drops events when a consumer falls behind', async () => {
      const stream = createStreamDrain({ perSubscriberQueue: 2 })
      const iter = stream.events()

      for (let i = 1; i <= 5; i++) {
        await stream.drain(makeContext(makeEvent(i)))
      }

      const collected: number[] = []
      for (let i = 0; i < 2; i++) {
        const result = await iter.next()
        if (!result.done) collected.push(result.value.id as number)
      }
      await iter.return!()

      expect(collected).toEqual([4, 5])
      expect(stream.droppedCount).toBeGreaterThanOrEqual(3)
    })

    it('supports multiple concurrent iterators', async () => {
      const stream = createStreamDrain()
      const a = stream.events()
      const b = stream.events()

      await stream.drain(makeContext(makeEvent(1)))

      const aResult = await a.next()
      const bResult = await b.next()

      expect((aResult.value as WideEvent).id).toBe(1)
      expect((bResult.value as WideEvent).id).toBe(1)

      await a.return!()
      await b.return!()
    })
  })

  describe('close', () => {
    it('disconnects sync listeners and ends async iterators', async () => {
      const stream = createStreamDrain()
      const listener = vi.fn()
      stream.subscribe(listener)
      const iter = stream.events()

      stream.close()

      const result = await iter.next()
      expect(result.done).toBe(true)
      expect(stream.subscriberCount).toBe(0)

      await stream.drain(makeContext(makeEvent(1)))
      expect(listener).not.toHaveBeenCalled()
    })

    it('still allows new subscriptions after close', async () => {
      const stream = createStreamDrain()
      stream.close()

      const listener = vi.fn()
      stream.subscribe(listener)
      await stream.drain(makeContext(makeEvent(1)))

      expect(listener).toHaveBeenCalledTimes(1)
    })
  })
})

describe('getDefaultStream / setDefaultStream', () => {
  afterEach(() => {
    setDefaultStream(null)
  })

  it('returns the same instance across calls', () => {
    const a = getDefaultStream()
    const b = getDefaultStream()
    expect(a).toBe(b)
  })

  it('honours buffer option only on first call', async () => {
    const stream = getDefaultStream({ buffer: 2 })
    for (let i = 1; i <= 5; i++) {
      await stream.drain({ event: makeEvent(i) })
    }
    expect(stream.recent().map(e => e.id)).toEqual([4, 5])
  })

  it('setDefaultStream(null) resets the singleton', () => {
    const a = getDefaultStream()
    setDefaultStream(null)
    const b = getDefaultStream()
    expect(a).not.toBe(b)
  })

  it('setDefaultStream(custom) replaces the singleton', () => {
    const custom = createStreamDrain()
    setDefaultStream(custom)
    expect(getDefaultStream()).toBe(custom)
  })
})
