import { environment } from './environment'

/**
 * Routing options shared by every gateway call Evi makes.
 *
 * Routing was landing on a $0.20/$0.40 deployment, the second dearest of the
 * ten serving this model, while the cheapest 1M-context ones sit near
 * $0.09/$0.18. Sorting beats a hardcoded provider order here: it keeps
 * following the price as deployments and promos move.
 */
export const gatewayRouting = {
  caching: 'auto',
  sort: 'cost',
} as const

/**
 * Tags stamped on every gateway request, read back through the spend report.
 *
 * The report groups by a single dimension at a time (`groupBy: 'tag'`), so each
 * dimension is its own tag rather than one compound string: asking for the tag
 * breakdown then yields one row per environment and one row per surface.
 *
 * @param kind - The channel that opened the session. eve reports framework
 * channels by bare name (`http`, `schedule`, `subagent`) and authored ones as
 * `channel:<name>`; the prefix is dropped so a row reads `evi:surface:github`.
 */
export function sessionTags(kind?: string): string[] {
  const surface = (kind ?? 'unknown').replace(/^channel:/, '')
  return [`evi:env:${environment()}`, `evi:surface:${surface}`]
}

