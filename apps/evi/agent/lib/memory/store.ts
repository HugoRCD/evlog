import { and, desc, eq, gt, ilike, isNull, or, sql } from 'drizzle-orm'
import { memories } from '../../../db/schema'
import { getDb } from '../db'
import { admit } from './policy'
import type { MemoryRecord, MemoryStore, MemoryTarget, RememberInput } from './types'
import { DEFAULT_SEARCH_LIMIT } from './types'

type Db = NonNullable<ReturnType<typeof getDb>>

const COLUMNS = {
  id: memories.id,
  tenantId: memories.tenantId,
  realm: memories.realm,
  realmKey: memories.realmKey,
  title: memories.title,
  text: memories.text,
  volatility: memories.volatility,
  sourceKind: memories.sourceKind,
  source: memories.source,
  updatedAt: memories.updatedAt,
}

/**
 * Built from resolved targets, never from model input. An empty list yields
 * `false`: a scope that resolved to nothing must return nothing, not everything.
 */
function within(targets: readonly MemoryTarget[]) {
  if (targets.length === 0) return sql`false`
  return or(...targets.map(target => and(
    eq(memories.tenantId, target.tenantId),
    eq(memories.realm, target.realm),
    eq(memories.realmKey, target.realmKey),
  )))
}

/** Believed now: not invalidated, and not past its validity window. */
function live() {
  return and(
    isNull(memories.invalidatedAt),
    or(isNull(memories.validTo), gt(memories.validTo, sql`now()`)),
  )
}

export function createMemoryStore(db: Db): MemoryStore {
  return {
    async remember(input: RememberInput): Promise<MemoryRecord> {
      const admitted = admit(input)
      const [row] = await db
        .insert(memories)
        .values({
          tenantId: input.tenantId,
          realm: input.realm,
          realmKey: input.realmKey,
          title: admitted.title,
          text: admitted.text,
          contentHash: admitted.contentHash,
          volatility: input.volatility ?? 'durable',
          validTo: input.validTo ?? null,
          supersedes: input.supersedes ?? null,
          sourceKind: input.sourceKind,
          source: input.source,
          createdBy: input.createdBy,
        })
        // The same fact restated refreshes it rather than duplicating, and
        // revives one that had been forgotten.
        .onConflictDoUpdate({
          target: [memories.tenantId, memories.realm, memories.realmKey, memories.contentHash],
          set: {
            title: admitted.title,
            updatedAt: sql`now()`,
            invalidatedAt: null,
            validTo: input.validTo ?? null,
            source: input.source,
          },
        })
        .returning(COLUMNS)
      if (row === undefined) throw new Error('The memory could not be written.')

      if (input.supersedes !== undefined) {
        await db
          .update(memories)
          .set({ invalidatedAt: sql`now()` })
          .where(and(eq(memories.id, input.supersedes), within([input])))
      }
      return row
    },

    async list(targets, limit = DEFAULT_SEARCH_LIMIT): Promise<MemoryRecord[]> {
      return await db
        .select(COLUMNS)
        .from(memories)
        .where(and(within(targets), live()))
        .orderBy(desc(memories.updatedAt))
        .limit(limit)
    },

    async search(targets, query, limit = DEFAULT_SEARCH_LIMIT): Promise<MemoryRecord[]> {
      const term = `%${query.trim()}%`
      return await db
        .select(COLUMNS)
        .from(memories)
        .where(and(
          within(targets),
          live(),
          or(ilike(memories.text, term), ilike(memories.title, term)),
        ))
        .orderBy(desc(memories.updatedAt))
        .limit(limit)
    },

    async forget(targets, id): Promise<boolean> {
      const rows = await db
        .update(memories)
        .set({ invalidatedAt: sql`now()` })
        .where(and(eq(memories.id, id), within(targets), isNull(memories.invalidatedAt)))
        .returning({ id: memories.id })
      return rows.length > 0
    },
  }
}

let store: MemoryStore | undefined

/** Null when no database is configured, mirroring `getDb`. */
export function getMemoryStore(): MemoryStore | null {
  const db = getDb()
  if (db === null) return null
  store ??= createMemoryStore(db)
  return store
}
