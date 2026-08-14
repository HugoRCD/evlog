import { channelName } from './channel'
import { environment } from './environment'

/** Scheduled runs answer to nobody in real time; every other surface has someone waiting. */
function isBatch(kind?: string): boolean {
  return channelName(kind) === 'schedule'
}

/**
 * Routing shared by every gateway call. A turn is prefill-bound — tens of
 * thousands of prompt tokens against a few hundred generated ones — so an
 * interactive surface sorts on time to first token rather than on price.
 * Schedules keep following the cheapest deployment.
 */
export function gatewayRouting(kind?: string) {
  return {
    caching: 'auto',
    sort: isBatch(kind) ? 'cost' : 'ttft',
    zeroDataRetention: true,
  } as const
}

/**
 * Tags stamped on every gateway request. One tag per dimension, not a compound
 * string: the spend report groups by a single dimension at a time.
 */
export function sessionTags(kind?: string): string[] {
  return [`evi:env:${environment()}`, `evi:surface:${channelName(kind)}`]
}
