/** Frameworks the `map` command can scan (adapter selection key). */
export type Framework = 'nuxt' | 'nitro' | 'next' | 'tanstack-start'

/** Route shape as detected on disk, before observability checks run. */
export type RouteKind = 'api' | 'page' | 'middleware' | 'server-action' | 'cron' | 'websocket'

/** One observability check `map` runs against a route handler. */
export type CheckId =
  | 'wide-event'
  | 'context'
  | 'structured-errors'
  | 'audit'
  | 'error-handling'
  | 'page-error-handling'

export interface HandlerLocation {
  line: number
  column: number
}

export interface CheckEvidence {
  file: string
  line: number
  snippet?: string
}

export interface CheckResult {
  status: 'pass' | 'fail' | 'n/a'
  evidence?: CheckEvidence
  message?: string
}

export interface Sensitivity {
  level: 'high' | 'medium' | 'none'
  reasons: string[]
}

/** Route extracted from the filesystem, before checks run. */
export interface RawRouteEntry {
  framework: Framework
  kind: RouteKind
  method: string | null
  path: string
  file: string
  handler: HandlerLocation | null
}

/** A scanned route with checks, sensitivity, and score attached. */
export interface RouteEntry extends RawRouteEntry {
  id: string
  checks: Partial<Record<CheckId, CheckResult>>
  sensitivity: Sensitivity
  score: number
}

/** The `evlog.map.json` shape written to disk. */
export interface MapFile {
  version: 1
  generatedAt: string
  framework: string
  projectName: string
  score: number
  routes: RouteEntry[]
}

export interface ScanContext {
  projectRoot: string
  framework: Framework
  projectName: string
  hasEvlog: boolean
  verbose: boolean
}

export interface FrameworkAdapter {
  framework: Framework
  extractRoutes: (ctx: ScanContext) => Promise<RawRouteEntry[]>
}

export type Grade = 'excellent' | 'good' | 'needs-work' | 'at-risk'

export interface ScanResult {
  map: MapFile
  grade: Grade
  summary: {
    instrumented: number
    partial: number
    dark: number
    exempt: number
  }
}
