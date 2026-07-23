import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time comparison for the shared dashboard password.
 * Returns `false` for empty/missing values instead of throwing.
 *
 * Named distinctly from `nuxt-auth-utils`' own auto-imported `verifyPassword`
 * (a bcrypt-style hash comparator we don't use) to avoid shadowing it.
 */
export function verifyDashboardPassword(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false

  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false

  return timingSafeEqual(a, b)
}
