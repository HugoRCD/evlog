import { tool } from 'ai'
import { z } from 'zod'
import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'

export const queryEvents = tool({
  description: 'Query the evlog_events SQLite table. Returns rows as JSON. Only SELECT queries are allowed.',
  inputSchema: z.object({
    query: z.string().describe('A SELECT SQL query on the evlog_events table'),
  }),
  execute: async ({ query }) => {
    if (!query.trim().toUpperCase().startsWith('SELECT'))
      return { error: 'Only SELECT queries are allowed' }

    try {
      const rows = await db.all(sql.raw(query))
      return { rows: rows.slice(0, 50), count: rows.length }
    } catch (err: any) {
      return { error: err.message || 'Query failed' }
    }
  },
})
