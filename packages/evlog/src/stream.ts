/**
 * In-process event stream — the foundation for any local consumer (devtools,
 * dashboards, CLIs, SSE/WebSocket bridges) to observe events flowing through
 * the drain pipeline without re-implementing one.
 *
 * @example
 * ```ts
 * import { createStreamDrain } from 'evlog/stream'
 *
 * const stream = createStreamDrain({ buffer: 200 })
 * nitroApp.hooks.hook('evlog:drain', stream.drain)
 *
 * stream.subscribe((event) => {
 *   if (event.level === 'error') notifyOps(event)
 * })
 *
 * for await (const event of stream.events()) {
 *   console.log(event.timestamp, event.action ?? event.message)
 * }
 * ```
 */

import type { DrainContext, WideEvent } from './types'

/** Configuration accepted by {@link createStreamDrain}. */
export interface StreamDrainOptions {
  /**
   * Number of recent events kept in the ring buffer and replayed to new
   * subscribers via {@link StreamDrain.recent}. Set to `0` to disable
   * replay.
   * @default 500
   */
  buffer?: number
  /**
   * Optional predicate run on each drained event — return `false` to skip
   * the event entirely (it is neither buffered nor delivered).
   */
  filter?: (event: WideEvent) => boolean
  /**
   * Per-subscriber queue size for the {@link StreamDrain.events} async
   * iterator. When the consumer falls behind by more than this many events,
   * the oldest queued events are dropped — the drain is never blocked.
   * @default 1000
   */
  perSubscriberQueue?: number
}

/** Live drain that exposes its events to in-process subscribers. */
export interface StreamDrain {
  /**
   * Drain callback. Pass to `nitroApp.hooks.hook('evlog:drain', stream.drain)`
   * or to a plugin via `drainPlugin('stream', stream.drain)`.
   */
  drain: (ctx: DrainContext | DrainContext[]) => Promise<void>
  /**
   * Register a synchronous listener. Errors thrown by the listener are
   * caught and logged — they never affect other subscribers or the drain.
   * @returns Unsubscribe function.
   */
  subscribe: (listener: (event: WideEvent) => void) => () => void
  /**
   * Async iterator over live events. Each call returns a fresh iterator —
   * past events from the ring buffer are NOT replayed. Combine with
   * {@link StreamDrain.recent} to seed history.
   *
   * Calling `return()` (e.g. via `break`) cleanly unsubscribes.
   */
  events: () => AsyncIterableIterator<WideEvent>
  /**
   * Snapshot of buffered events (oldest first, most recent last). Useful
   * to seed a new connection / UI panel before switching to live updates.
   */
  recent: () => readonly WideEvent[]
  /** Number of currently active subscribers (sync + async iterators). */
  readonly subscriberCount: number
  /** Number of events dropped because the buffer was disabled or wrapped. */
  readonly droppedCount: number
  /**
   * Disconnect all subscribers and end any pending async iterators. The
   * stream itself remains usable — new subscriptions still work.
   */
  close: () => void
}

const DEFAULT_BUFFER = 500
const DEFAULT_QUEUE = 1000

interface AsyncSubscriber {
  push: (event: WideEvent) => void
  end: () => void
}

/**
 * Create an in-process {@link StreamDrain}. Multiple stream drains can
 * coexist in the same process — they are fully independent.
 */
export function createStreamDrain(options: StreamDrainOptions = {}): StreamDrain {
  const bufferSize = Math.max(0, Math.floor(options.buffer ?? DEFAULT_BUFFER))
  const queueLimit = Math.max(1, Math.floor(options.perSubscriberQueue ?? DEFAULT_QUEUE))
  const { filter } = options

  const buffer: WideEvent[] = []
  const syncListeners = new Set<(event: WideEvent) => void>()
  const asyncSubscribers = new Set<AsyncSubscriber>()
  let dropped = 0

  function publish(event: WideEvent): void {
    if (filter && !filter(event)) return

    if (bufferSize > 0) {
      buffer.push(event)
      while (buffer.length > bufferSize) {
        buffer.shift()
        dropped++
      }
    }

    for (const listener of syncListeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('[evlog/stream] subscriber threw:', err)
      }
    }

    for (const sub of asyncSubscribers) {
      sub.push(event)
    }
  }

  const drain: StreamDrain['drain'] = (ctx) => {
    const contexts = Array.isArray(ctx) ? ctx : [ctx]
    for (const c of contexts) {
      if (c?.event) publish(c.event)
    }
    return Promise.resolve()
  }

  const subscribe: StreamDrain['subscribe'] = (listener) => {
    syncListeners.add(listener)
    return () => {
      syncListeners.delete(listener)
    }
  }

  function createAsyncIterator(): AsyncIterableIterator<WideEvent> {
    const queue: WideEvent[] = []
    let pendingResolve: ((result: IteratorResult<WideEvent>) => void) | null = null
    let closed = false

    const subscriber: AsyncSubscriber = {
      push(event) {
        if (closed) return
        if (pendingResolve) {
          const resolve = pendingResolve
          pendingResolve = null
          resolve({ value: event, done: false })
          return
        }
        queue.push(event)
        while (queue.length > queueLimit) {
          queue.shift()
          dropped++
        }
      },
      end() {
        if (closed) return
        closed = true
        if (pendingResolve) {
          const resolve = pendingResolve
          pendingResolve = null
          resolve({ value: undefined, done: true })
        }
      },
    }

    asyncSubscribers.add(subscriber)

    const iterator: AsyncIterableIterator<WideEvent> = {
      [Symbol.asyncIterator]() {
        return iterator
      },
      next(): Promise<IteratorResult<WideEvent>> {
        if (queue.length > 0) {
          return Promise.resolve({ value: queue.shift()!, done: false })
        }
        if (closed) {
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise((resolve) => {
          pendingResolve = resolve
        })
      },
      return(): Promise<IteratorResult<WideEvent>> {
        closed = true
        asyncSubscribers.delete(subscriber)
        if (pendingResolve) {
          const resolve = pendingResolve
          pendingResolve = null
          resolve({ value: undefined, done: true })
        }
        return Promise.resolve({ value: undefined, done: true })
      },
    }

    return iterator
  }

  return {
    drain,
    subscribe,
    events: createAsyncIterator,
    recent: () => buffer.slice(),
    get subscriberCount() {
      return syncListeners.size + asyncSubscribers.size
    },
    get droppedCount() {
      return dropped
    },
    close() {
      syncListeners.clear()
      for (const sub of asyncSubscribers) {
        sub.end()
      }
      asyncSubscribers.clear()
    },
  }
}

let defaultStream: StreamDrain | null = null

/**
 * Lazily create / return the process-wide default {@link StreamDrain}.
 *
 * Used by built-in framework integrations (Nuxt SSE bridge, devtools panel)
 * so they share a single buffer. Custom code can subscribe to this stream
 * to observe everything draining through evlog without registering a new
 * drain.
 *
 * @example
 * ```ts
 * import { getDefaultStream } from 'evlog/stream'
 *
 * getDefaultStream().subscribe((event) => console.log(event.action))
 * ```
 */
export function getDefaultStream(options?: StreamDrainOptions): StreamDrain {
  if (!defaultStream) defaultStream = createStreamDrain(options)
  return defaultStream
}

/**
 * Replace or clear the default stream. Pass `null` to reset (mostly useful
 * in tests).
 */
export function setDefaultStream(stream: StreamDrain | null): void {
  defaultStream?.close()
  defaultStream = stream
}
