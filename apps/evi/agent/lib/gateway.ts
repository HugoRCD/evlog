import { channelName } from './channel'
import { environment } from './environment'

/** Scheduled runs answer to nobody in real time; every other surface has someone waiting. */
function isBatch(kind?: string): boolean {
  return channelName(kind) === 'schedule'
}

/**
 * Routing shared by every gateway call: schedules sort on cost, every
 * interactive surface sorts on time to first token.
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
