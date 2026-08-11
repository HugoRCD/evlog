import { defineConfig } from 'drizzle-kit'

function databaseUrl(): string {
  for (const name of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRESQL_URL']) {
    const value = process.env[name]
    if (value) return value
  }
  return ''
}

// Connection URLs for each environment are pulled from `vercel env pull` in
// apps/evi. `generate` never connects, so an empty URL keeps it usable without
// a database; `migrate` and `push` need the real value and fail on the empty
// string with drizzle-kit's own "url required" error.
export default defineConfig({
  dialect: 'postgresql',
  casing: 'snake_case',
  schema: './db/schema.ts',
  out: './db/migrations',
  dbCredentials: {
    url: databaseUrl(),
  },
})
