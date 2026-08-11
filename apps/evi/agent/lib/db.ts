import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { schema } from '../../db/schema'

/**
 * Connection string for the current environment, or null when no database is
 * configured. Accepts the Vercel Marketplace Postgres names (Neon sets
 * `POSTGRES_URL`, some integrations `POSTGRESQL_URL`) alongside the plain
 * `DATABASE_URL`, mirroring how the telemetry app reads its store (its
 * `.env.example` documents the same three).
 */
export function databaseUrl(): string | null {
  for (const name of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL']) {
    const value = process.env[name]
    if (value) return value
  }
  return null
}

/**
 * True when a connection string is present. Features that need persistence
 * gate on this first and degrade cleanly (return an unavailable error) when
 * it is false, so local runs without the DB keep working.
 */
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
  client ??= drizzle(postgres(url), { schema })
  return client
}
