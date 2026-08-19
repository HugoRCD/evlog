import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { schema } from '../../db/schema'

/**
 * Connection string for the current environment, or null when no database is
 * configured. Accepts the Vercel Marketplace Postgres names alongside the
 * plain `DATABASE_URL`, mirroring how the telemetry app reads its store.
 */
export function databaseUrl(): string | null {
  for (const name of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL']) {
    const value = process.env[name]
    if (value) return value
  }
  return null
}

/** Features that need persistence gate on this and degrade cleanly, so local runs without the DB keep working. */
export function isDbConfigured(): boolean {
  return databaseUrl() !== null
}

let client: ReturnType<typeof drizzle<typeof schema>> | undefined

/**
 * The memoized Drizzle client, or null when no database is configured. Callers
 * are expected to check `isDbConfigured()` first; this returns null rather than
 * throwing so a feature that forgot the guard degrades instead of crashing.
 */
export function getDb(): ReturnType<typeof drizzle<typeof schema>> | null {
  const url = databaseUrl()
  if (!url) return null
  // `casing` has to be set here as well as in `drizzle.config.ts`: the config
  // only reaches drizzle-kit, so without this the migration creates
  // `person_id` while the query builder asks for `"personId"`.
  client ??= drizzle(postgres(url), { schema, casing: 'snake_case' })
  return client
}
