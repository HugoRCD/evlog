import type { SessionAuthContext } from 'eve/context'
import { getDb } from '../db'
import { resolvePersonId } from './identity'
import { readableTargets, tenantOf } from './scope'
import { renderCoreBlock } from './render'
import { getMemoryStore } from './store'
import type { MemoryStore, MemoryTarget } from './types'

export interface MemorySession {
  tenantId: string
  personId: string | null
  targets: MemoryTarget[]
  store: MemoryStore
}

/**
 * Resolved once from verified auth. Null means no claim to any memory (no
 * tenant, no database, or an autonomous turn) — never an error.
 */
export async function openMemorySession(
  auth: SessionAuthContext | null,
): Promise<MemorySession | null> {
  const tenantId = tenantOf(auth)
  if (tenantId === null) return null

  const db = getDb()
  const store = getMemoryStore()
  if (db === null || store === null) return null

  const personId = await resolvePersonId(db, tenantId, auth)
  const targets = readableTargets(auth, personId)
  if (targets.length === 0) return null

  return { tenantId, personId, targets, store }
}

/** The core block for this session, or null when there is nothing to say. */
export async function buildCoreBlock(session: MemorySession): Promise<string | null> {
  return renderCoreBlock(await session.store.list(session.targets, 24))
}
