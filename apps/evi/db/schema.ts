// Drizzle schema for Evi's store. Tables are added by the features that need
// them; the binding object exists so `drizzle(client, { schema })` in
// `agent/lib/db.ts` is typed against whatever tables exist.
import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

/** Where a caller reached Evi from. One per authored channel, plus local dev. */
export type Surface = 'github' | 'linear' | 'imessage' | 'mcp' | 'cloud' | 'local'

export type PersonRole = 'maintainer' | 'member' | 'visitor'

/** What a memory is about. `project` and `repo` are declared but not yet written. */
export type Realm = 'agent' | 'person' | 'project' | 'repo'

/**
 * `provisional` facts carry a `validTo`; `durable` ones hold until contradicted.
 * Nothing a release can invalidate is stored under either.
 */
export type Volatility = 'durable' | 'provisional'

/** How the fact arrived. Drives trust, and what the interview should ask next. */
export type SourceKind = 'interview' | 'stated' | 'imported' | 'derived'

export interface MemorySource {
  surface: Surface
  sessionId: string
  /** The thread, PR, or file the fact came from, when there is one to point at. */
  url: string | null
}

export const people = pgTable('people', {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: text().notNull(),
  displayName: text().notNull().default(''),
  role: text().$type<PersonRole>().notNull().default('visitor'),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, table => [index().on(table.tenantId),])

/**
 * One external identity belongs to one person *within a tenant*. Scoped rather
 * than global on purpose: the same GitHub account appearing under two
 * installations is two people, and linking them would leak the existence of one
 * tenant to another.
 */
export const identities = pgTable('identities', {
  personId: uuid().notNull(),
  tenantId: text().notNull(),
  surface: text().$type<Surface>().notNull(),
  externalId: text().notNull(),
  verifiedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex().on(table.tenantId, table.surface, table.externalId),
  index().on(table.personId),
])

export const memories = pgTable('memories', {
  id: uuid().primaryKey().defaultRandom(),
  /** Never null. Every read and write carries one; a query without it is a bug. */
  tenantId: text().notNull(),
  realm: text().$type<Realm>().notNull(),
  /**
   * A person id, `owner/name`, or `evlog`. Empty string for the `agent` realm,
   * never null: Postgres treats nulls as distinct in a unique index, so a
   * nullable key would silently defeat the dedupe below.
   */
  realmKey: text().notNull().default(''),

  title: text().notNull().default(''),
  text: text().notNull(),
  contentHash: text().notNull(),

  /*
   * Two clocks. `validFrom`/`validTo` are when the fact held in the world;
   * `recordedAt`/`invalidatedAt` are when Evi believed it. A contradiction
   * stamps `invalidatedAt` and never deletes, so a superseded fact stays
   * answerable as history and is never served as current.
   */
  volatility: text().$type<Volatility>().notNull().default('durable'),
  validFrom: timestamp({ withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp({ withTimezone: true }),
  recordedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  invalidatedAt: timestamp({ withTimezone: true }),
  /** Set on the replacement, so lineage reads forward. */
  supersedes: uuid(),

  sourceKind: text().$type<SourceKind>().notNull(),
  source: jsonb().$type<MemorySource>().notNull(),
  createdBy: text().notNull(),

  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex().on(table.tenantId, table.realm, table.realmKey, table.contentHash),
  index().on(table.tenantId, table.realm, table.realmKey, table.invalidatedAt),
  // Recency ordering for the core block, over live rows only.
  index()
    .on(table.tenantId, table.realm, table.realmKey, table.updatedAt.desc())
    .where(sql`invalidated_at is null`),
])

export const schema = { people, identities, memories }
