import { createEvlogError } from 'evlog'

export function parseRetention(retention: string): { value: number, unit: string, totalMinutes: number, totalMs: number } {
  const match = retention.match(/^(\d+)(d|h|m)$/)
  if (!match) {
    throw createEvlogError({
      message: `[evlog/nuxthub] Invalid retention format: "${retention}"`,
      why: 'The retention value must be a number followed by a unit: d (days), h (hours), or m (minutes)',
      fix: `Change retention to a valid format, e.g., "30d", "24h", or "60m"`,
      link: 'https://evlog.dev/nuxthub/retention',
    })
  }

  const [, numStr, unit] = match
  const num = Number(numStr)

  let totalMinutes: number
  switch (unit) {
    case 'm':
      totalMinutes = num
      break
    case 'h':
      totalMinutes = num * 60
      break
    case 'd':
      totalMinutes = num * 24 * 60
      break
    default:
      throw createEvlogError({
        message: `[evlog/nuxthub] Unknown retention unit: "${unit}"`,
        why: 'The retention value must use one of the supported units: d (days), h (hours), or m (minutes)',
        fix: `Change retention to a valid format, e.g., "30d", "24h", or "60m"`,
        link: 'https://evlog.dev/nuxthub/retention',
      })
  }

  return {
    value: num,
    unit: unit!,
    totalMinutes,
    totalMs: totalMinutes * 60 * 1000,
  }
}

export function retentionToCron(retention: string): string {
  const { totalMinutes } = parseRetention(retention)

  const halfMinutes = Math.max(1, Math.floor(totalMinutes / 2))

  if (halfMinutes < 60) {
    return `*/${halfMinutes} * * * *`
  }

  const halfHours = Math.floor(halfMinutes / 60)
  if (halfHours >= 24) {
    return '0 3 * * *'
  }

  return `0 */${halfHours} * * *`
}
