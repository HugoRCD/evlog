import { db, schema } from '@nuxthub/db'
import { count as sqlCount, desc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const level = query.level as string | undefined
  const limit = Math.min(Number(query.limit) || 50, 200)

  const conditions = level ? eq(schema.evlogEvents.level, level) : undefined

  const [events, countResult] = await Promise.all([
    db.select()
      .from(schema.evlogEvents)
      .where(conditions)
      .orderBy(desc(schema.evlogEvents.createdAt))
      .limit(limit),
    db.select({ total: sqlCount() })
      .from(schema.evlogEvents)
      .where(conditions),
  ])

  const total = countResult[0]?.total ?? 0

  return { total, count: events.length, events }
})
