import type { WideEvent } from './types'
import { registerWideEventPublisher } from './shared/wideEventChannel'

/**
 * Channel every emitted wide event is published on.
 *
 * Named after the package, matching the convention the ecosystem settled on
 * (`h3.request`, `srvx.request`, `unstorage.get`).
 */
export const EVLOG_EVENT_CHANNEL = 'evlog.event'

/** Message published on {@link EVLOG_EVENT_CHANNEL}. Mirrors `DrainContext`. */
export interface WideEventMessage {
  event: WideEvent
}

/**
 * Publish every wide event on the `evlog.event` diagnostics channel.
 *
 * Call once at startup: events emitted before the returned promise settles are
 * not published. Subscribers receive the same object drains receive —
 * post-redaction, post-enrich — and must treat it as read-only. They run
 * synchronously and are not awaited, so this is an observation side channel,
 * not a transport: drains stay the right tool for delivery.
 *
 * A subscriber that throws is **not** contained: `Channel.publish()` re-raises
 * it as an uncaught exception on the next tick. Keep subscribers total.
 *
 * @returns A disposer that stops publishing.
 *
 * @example
 * ```ts
 * // server/plugins/evlog-diagnostics.ts
 * import { enableDiagnosticsChannel } from 'evlog/diagnostics'
 *
 * export default defineNitroPlugin(async () => {
 *   await enableDiagnosticsChannel()
 * })
 * ```
 */
export async function enableDiagnosticsChannel(): Promise<() => void> {
  const { createChannelPublisher } = await import('./shared/diagnostics-channel.node.js')

  registerWideEventPublisher(createChannelPublisher(EVLOG_EVENT_CHANNEL))

  return () => registerWideEventPublisher(null)
}

/**
 * Typed subscription to {@link EVLOG_EVENT_CHANNEL}.
 *
 * Convenience for consumers already depending on evlog. A consumer that should
 * not depend on evlog subscribes to the channel name directly with
 * `node:diagnostics_channel`.
 *
 * @returns A disposer that unsubscribes.
 */
export async function subscribeToWideEvents(listener: (event: WideEvent) => void): Promise<() => void> {
  const { subscribeToChannel } = await import('./shared/diagnostics-channel.node.js')

  return subscribeToChannel(EVLOG_EVENT_CHANNEL, message => listener((message as WideEventMessage).event))
}
