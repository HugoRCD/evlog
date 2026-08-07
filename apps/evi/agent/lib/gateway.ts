import { channelName } from './channel'
import { environment } from './environment'

/** Routing shared by every gateway call. `sort` keeps following the cheapest deployment. */
export const gatewayRouting = {
  caching: 'auto',
  sort: 'cost',
} as const

/**
 * Tags stamped on every gateway request, read back through the spend report.
 *
 * One tag per dimension, not one compound string: the report groups by a single
 * dimension at a time, so this yields a row per environment and a row per surface.
 */
export function sessionTags(kind?: string): string[] {
  return [`evi:env:${environment()}`, `evi:surface:${channelName(kind)}`]
}

