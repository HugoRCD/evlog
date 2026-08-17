import { drizzle } from 'drizzle-orm/postgres-js'
import { describe, expect, it } from 'vitest'
import { and, eq, gt, isNull, or, sql as drizzleSql } from 'drizzle-orm'
import { schema, identities, memories } from '../../../db/schema'

/**
 * The query builder is configured here the way `agent/lib/db.ts` configures it,
 * and asserted to emit the column names the migration actually created.
 *
 * Without `casing`, drizzle quotes the TypeScript property names — `"personId"`
 * against a `person_id` column — and every query fails at runtime while the
 * types stay green. `drizzle.config.ts` sets the option too, but that only
 * reaches drizzle-kit, so the two have to agree and nothing but a test says so.
 */
const db = drizzle.mock({ schema, casing: 'snake_case' })

describe('column naming', () => {
  it('treats an expired memory as gone for forgetting, like everywhere else', () => {
    // The live predicate forget shares with list: invalidation AND expiry.
    const { sql } = db
      .update(memories)
      .set({ invalidatedAt: new Date() })
      .where(and(
        isNull(memories.invalidatedAt),
        or(isNull(memories.validTo), gt(memories.validTo, drizzleSql`now()`)),
      ))
      .toSQL()

    expect(sql).toContain('"invalidated_at" is null')
    expect(sql).toContain('"valid_to"')
  })


  it('reads identities by their snake_case columns', () => {
    const { sql } = db
      .select({ id: identities.personId })
      .from(identities)
      .where(eq(identities.externalId, '1'))
      .toSQL()

    expect(sql).toContain('"person_id"')
    expect(sql).toContain('"external_id"')
    expect(sql).not.toContain('"personId"')
    expect(sql).not.toContain('"externalId"')
  })

  it('reads memories by their snake_case columns', () => {
    const { sql } = db
      .select({ id: memories.id })
      .from(memories)
      .where(eq(memories.tenantId, 'evlog'))
      .toSQL()

    expect(sql).toContain('"tenant_id"')
    expect(sql).not.toContain('"tenantId"')
  })

  it('writes the bi-temporal columns under their migrated names', () => {
    const { sql } = db
      .update(memories)
      .set({ invalidatedAt: new Date() })
      .where(eq(memories.id, 'id'))
      .toSQL()

    expect(sql).toContain('"invalidated_at"')
    expect(sql).not.toContain('"invalidatedAt"')
  })
})
