import type { SessionAuthContext } from 'eve/context'
import { isAutonomous, isMaintainer, isScheduleAppAuth } from '../trust'
import type { MemoryTarget, Realm } from './types'

/** The tenant Evi's own repository lives under. Installations get their own. */
export const HOME_TENANT = 'evlog'

/** The `agent` realm is a singleton, so its key is the empty string, not null. */
export const SINGLETON = ''

/**
 * Only the home tenant exists today. When installations arrive this reads the
 * tenant off verified route auth instead, and nothing else here moves.
 */
export function tenantOf(auth: SessionAuthContext | null): string | null {
  if (isAutonomous(auth)) return null
  if (isMaintainer(auth) || isScheduleAppAuth(auth)) return HOME_TENANT
  return null
}

/**
 * An autonomous turn reads nothing: it runs unattended on an untrusted issue
 * body and posts publicly.
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

/** Only a maintainer writes at this phase; the schedule candidate queue does not exist yet. */
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
