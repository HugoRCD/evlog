/**
 * Community enricher skeleton — reference implementation.
 *
 * Replace `Tenant` / `tenant` with your concept (region, build, feature flags,
 * deployment metadata, …). Ship the package as `evlog-tenant` or similar.
 */
import {
  defineEnricher,
  getHeader,
  type EnricherOptions,
} from 'evlog/toolkit'

export interface TenantInfo {
  /** Tenant identifier (e.g. workspace UUID). */
  id: string
  /** Optional human-readable organization name. */
  org?: string
  /** Optional plan identifier. */
  plan?: string
}

export interface CreateTenantEnricherOptions extends EnricherOptions {
  /** Header name to read the tenant id from. Default: `x-tenant-id`. */
  headerName?: string
  /** Header name to read the org name from. Default: `x-tenant-org`. */
  orgHeaderName?: string
  /** Header name to read the plan from. Default: `x-tenant-plan`. */
  planHeaderName?: string
}

/**
 * Enrich events with tenant metadata extracted from request headers.
 *
 * @example
 * ```ts
 * import { defineEvlog } from 'evlog/toolkit'
 * import { createTenantEnricher } from 'evlog-tenant'
 *
 * defineEvlog({ enrich: createTenantEnricher({ headerName: 'x-org-id' }) })
 * ```
 */
export function createTenantEnricher(options: CreateTenantEnricherOptions = {}) {
  const headerName = options.headerName ?? 'x-tenant-id'
  const orgHeaderName = options.orgHeaderName ?? 'x-tenant-org'
  const planHeaderName = options.planHeaderName ?? 'x-tenant-plan'

  return defineEnricher<TenantInfo>({
    name: 'tenant',
    field: 'tenant',
    compute: ({ headers }) => {
      const id = getHeader(headers, headerName)
      if (!id) return undefined
      return {
        id,
        org: getHeader(headers, orgHeaderName),
        plan: getHeader(headers, planHeaderName),
      }
    },
  }, options)
}
