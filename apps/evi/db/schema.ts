// Drizzle schema for Evi's store. Tables are added by the features that need
// them; the binding object exists so `drizzle(client, { schema })` in
// `agent/lib/db.ts` is typed against whatever tables exist.
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Feedback about Evi's answers, captured across channels and read later by the
 * weekly self-review and the evals. Two kinds of row share the table:
 * a reaction (thumbs up/down, `source: 'reaction'`, no free text) and written
 * feedback (`source: 'written'`, with the person's reason in `text`). `verdict`
 * is the binary signal either way; `author`, `messageRef` and `[thread, session]Ref`
 * place the judgement back in the conversation it came from.
 */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: text('channel').notNull(),
    source: text('source').notNull(),
    verdict: text('verdict').notNull(),
    author: text('author').notNull(),
    text: text('text'),
    messageRef: text('message_ref'),
    threadRef: text('thread_ref'),
    sessionRef: text('session_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // The weekly review reads the window since last week; keep that cheap.
  (table) => [index('feedback_created_at_idx').on(table.createdAt)],
)

export const schema = { feedback }
