import { channel } from 'node:diagnostics_channel'
import type { WideEvent } from '../types'

/**
 * Build a publisher bound to `name`. Kept in a `.node` module so the static
 * `node:diagnostics_channel` import never reaches the main bundle graph.
 *
 * @internal
 */
export function createChannelPublisher(name: string): (event: WideEvent) => void {
  const eventChannel = channel(name)

  return (event) => {
    if (eventChannel.hasSubscribers) eventChannel.publish({ event })
  }
}

/**
 * Subscribe to `name`, returning an unsubscribe.
 *
 * Uses the channel instance methods rather than the module-level
 * `subscribe()` / `unsubscribe()`, which only exist from Node 18.7 — below the
 * `>=18.0.0` this package declares.
 *
 * @internal
 */
export function subscribeToChannel(name: string, onMessage: (message: unknown) => void): () => void {
  const eventChannel = channel(name)

  eventChannel.subscribe(onMessage)
  return () => eventChannel.unsubscribe(onMessage)
}
