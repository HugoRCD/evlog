import { channelName } from './channel'
import { environment } from './environment'

/** Routing shared by every gateway call. `sort` keeps following the cheapest deployment. */
export const gatewayRouting = {
  caching: 'auto',
  sort: 'cost',
} as const

/**
 * Tags stamped on every gateway request. One tag per dimension, not a compound
 * string: the spend report groups by a single dimension at a time.
 */
export function sessionTags(kind?: string): string[] {
  return [`evi:env:${environment()}`, `evi:surface:${channelName(kind)}`]
}

