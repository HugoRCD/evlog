import { bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * One row per ingested `RunEvent` (see `@evlog/telemetry`'s `RunEvent` type).
 * Column names are auto-derived to snake_case by the `casing: 'snake_case'`
 * option set on `hub.db` in `nuxt.config.ts`.
 */
export const runs = pgTable('runs', {
  id: bigserial({ mode: 'number' }).primaryKey(),
  idempotencyKey: text().notNull().unique(),
  toolName: text().notNull(),
  toolVersion: text().notNull(),
  command: text().notNull(),
  durationMs: integer().notNull(),
  outcome: text().notNull(),
  errorCode: text(),
  flags: jsonb().notNull().default({}),
  custom: jsonb().notNull().default({}),
  envNode: text().notNull(),
  envCi: boolean().notNull(),
  envProvider: text(),
  envTty: boolean().notNull(),
  envAgent: text(),
  environment: text().notNull(),
  machineId: text(),
  eventTimestamp: timestamp({ withTimezone: true }).notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('runs_event_timestamp_idx').on(table.eventTimestamp.desc()),
  index('runs_tool_name_idx').on(table.toolName),
  index('runs_environment_idx').on(table.environment),
])
