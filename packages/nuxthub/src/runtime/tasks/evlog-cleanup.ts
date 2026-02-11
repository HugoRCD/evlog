import { defineTask, useRuntimeConfig } from 'nitropack/runtime'
import { lt } from 'drizzle-orm'
// @ts-expect-error nuxthub/db is a virtual module provided by @nuxthub/core
import { db, schema } from '@nuxthub/db'
import { createEvlogError } from 'evlog'

function parseRetention(retention: string): number {
  const match = retention.match(/^(\d+)(d|h|m)$/)
  if (!match) {
    throw createEvlogError({
      message: `[evlog/nuxthub] Invalid retention format: "${retention}"`,
      why: 'The retention value must be a number followed by a unit: d (days), h (hours), or m (minutes)',
      fix: `Change retention to a valid format, e.g., "30d", "24h", or "60m"`,
      link: 'https://evlog.dev/nuxthub/retention',
    })
  }

  const [, value, unit] = match

  switch (unit) {
    case 'd': return Number(value) * 24 * 60 * 60 * 1000
    case 'h': return Number(value) * 60 * 60 * 1000
    case 'm': return Number(value) * 60 * 1000
    default:
      throw createEvlogError({
        message: `[evlog/nuxthub] Unknown retention unit: "${unit}"`,
        why: 'The retention value must use one of the supported units: d (days), h (hours), or m (minutes)',
        fix: `Change retention to a valid format, e.g., "30d", "24h", or "60m"`,
        link: 'https://evlog.dev/nuxthub/retention',
      })
  }
}

export default defineTask({
  meta: {
    name: 'evlog:cleanup',
    description: 'Clean up expired evlog events based on retention policy',
  },
  async run() {
    const config = useRuntimeConfig()
    const retention = (config as any).evlog?.retention ?? '30d'
    const retentionMs = parseRetention(retention)
    const cutoff = new Date(Date.now() - retentionMs).toISOString()

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
