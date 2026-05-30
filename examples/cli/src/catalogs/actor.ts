import type { AuditActor } from 'evlog'

/** Resolve the CLI operator for audit `actor` fields (demo — replace with your auth). */
export function resolveCliActor(): AuditActor {
  const id = process.env.USER ?? process.env.LOGNAME ?? 'demo-user'
  return {
    type: 'user',
    id,
    displayName: id,
    email: process.env.DEMO_USER_EMAIL,
  }
}
