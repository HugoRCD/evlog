import { defineTask, useRuntimeConfig } from 'nitropack/runtime'
import { lt } from 'drizzle-orm'
// @ts-expect-error nuxthub/db is a virtual module provided by @nuxthub/core
import { db, schema } from '@nuxthub/db'
import { parseRetention } from '../utils/retention'

export default defineTask({
  meta: {
    name: 'evlog:cleanup',
    description: 'Clean up expired evlog events based on retention policy',
  },
  async run() {
    const config = useRuntimeConfig()
    const retention = (config as any).evlog?.retention ?? '7d'
    const { totalMs } = parseRetention(retention)
    const cutoff = new Date(Date.now() - totalMs).toISOString()

    try {
      const result = await db.delete(schema.evlogEvents)
        .where(lt(schema.evlogEvents.createdAt, cutoff))

      console.log(`[evlog/nuxthub] Cleanup: deleted events older than ${retention} (before ${cutoff})`, result)
      return { result: 'success' }
    } catch (error) {
      console.error('[evlog/nuxthub] Cleanup task failed:', error)
      return { result: 'error' }
    }
  },
})
