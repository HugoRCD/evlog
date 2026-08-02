import { channel, subscribe, unsubscribe } from 'node:diagnostics_channel'
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

/** Subscribe to `name`, returning an unsubscribe. @internal */
export function subscribeToChannel(name: string, onMessage: (message: unknown) => void): () => void {
  subscribe(name, onMessage)
  return () => unsubscribe(name, onMessage)
}
