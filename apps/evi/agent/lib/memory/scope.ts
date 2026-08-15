import type { SessionAuthContext } from 'eve/context'
import { isAutonomous, isMaintainer, isScheduleAppAuth } from '../trust'
import type { MemoryTarget, Realm } from './types'

/** The tenant Evi's own repository lives under. Installations get their own. */
export const HOME_TENANT = 'evlog'

/** The `agent` realm is a singleton, so its key is the empty string, not null. */
export const SINGLETON = ''

/**
 * The tenant a session belongs to, or null when it belongs to none.
 *
 * Only the home tenant exists today, so this reads the caller. When
 * installations arrive it reads the tenant off verified route auth instead, and
 * nothing else in this file moves: every caller already asks this question here
 * rather than assuming an answer.
 */
export function tenantOf(auth: SessionAuthContext | null): string | null {
  if (isAutonomous(auth)) return null
  if (isMaintainer(auth) || isScheduleAppAuth(auth)) return HOME_TENANT
  return null
}

/**
 * What this session may read.
 *
 * An autonomous turn reads nothing: it runs unattended on an untrusted issue
 * body and posts publicly, so there is no memory it could use that it could not
 * also leak or be steered by.
 */
export function readableTargets(
  auth: SessionAuthContext | null,
  personId: string | null,
): MemoryTarget[] {
  const tenantId = tenantOf(auth)
  if (tenantId === null) return []

  const targets: MemoryTarget[] = [{ tenantId, realm: 'agent', realmKey: SINGLETON }]
  if (personId !== null) targets.push({ tenantId, realm: 'person', realmKey: personId })
  return targets
}

/**
 * Where this session may write, or null when it may not.
 *
 * Only a maintainer writes at this phase. Schedules read community threads, so
 * what they propose has to arrive as a candidate a person confirms, and that
 * queue does not exist yet.
 */
export function writableTarget(
  auth: SessionAuthContext | null,
  realm: Extract<Realm, 'agent' | 'person'>,
  personId: string | null,
): MemoryTarget | null {
  if (!isMaintainer(auth)) return null
  const tenantId = tenantOf(auth)
  if (tenantId === null) return null

  if (realm === 'person') {
    return personId === null ? null : { tenantId, realm, realmKey: personId }
  }
  return { tenantId, realm, realmKey: SINGLETON }
}
