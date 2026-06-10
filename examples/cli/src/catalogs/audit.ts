import { defineAuditCatalog } from 'evlog'

export const auditCatalog = defineAuditCatalog('demo', {
  SECRET_PULL: {
    target: 'secret_store',
    severity: 'high',
    description: 'Read secrets from a remote store and materialize them locally',
    redactPaths: ['token', 'password', 'secret'],
  },
  DEPLOY: {
    target: 'deployment',
    severity: 'critical',
    description: 'Promote a build to a target region',
    requiresChanges: true,
  },
  SYNC_EXPORT: {
    target: 'dataset',
    severity: 'medium',
    description: 'Export records from a remote API into the local workspace',
  },
})

declare module 'evlog' {
  interface RegisteredAuditCatalogs {
    demo: typeof auditCatalog
  }
}
