import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core'

export const evlogEvents = pgTable('evlog_events', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').notNull(),
  level: text('level').notNull(),
  service: text('service').notNull(),
  environment: text('environment').notNull(),
  method: text('method'),
  path: text('path'),
  status: integer('status'),
  durationMs: integer('duration_ms'),
  requestId: text('request_id'),
  source: text('source'),
  error: jsonb('error'),
  data: jsonb('data'),
  createdAt: text('created_at').notNull(),
}, table => [
  index('evlog_events_timestamp_idx').on(table.timestamp),
  index('evlog_events_level_idx').on(table.level),
  index('evlog_events_service_idx').on(table.service),
  index('evlog_events_status_idx').on(table.status),
  index('evlog_events_request_id_idx').on(table.requestId),
  index('evlog_events_created_at_idx').on(table.createdAt),
])
