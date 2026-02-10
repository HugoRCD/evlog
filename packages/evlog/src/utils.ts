import type { EnvironmentContext, LogLevel } from './types'

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

export function isServer(): boolean {
  return typeof window === 'undefined'
}

export function isClient(): boolean {
  return typeof window !== 'undefined'
}

export function isDev(): boolean {
  if (typeof process !== 'undefined') {
    return process.env.NODE_ENV !== 'production'
  }
  if (typeof window !== 'undefined') {
    return true
  }
  return false
}

export function detectEnvironment(): Partial<EnvironmentContext> {
  const env = typeof process !== 'undefined' ? process.env : {}
  const defaultEnvironment = isDev() ? 'development' : 'production'

  return {
    environment: env.NODE_ENV || defaultEnvironment,
    service: env.SERVICE_NAME || 'app',
    version: env.APP_VERSION,
    commitHash: env.COMMIT_SHA
      || env.GITHUB_SHA
      || env.VERCEL_GIT_COMMIT_SHA
      || env.CF_PAGES_COMMIT_SHA,
    region: env.VERCEL_REGION
      || env.AWS_REGION
      || env.FLY_REGION
      || env.CF_REGION,
  }
}

export function getConsoleMethod(level: LogLevel): LogLevel {
  return level
}

export const colors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  magenta: '\x1B[35m',
  cyan: '\x1B[36m',
  white: '\x1B[37m',
  gray: '\x1B[90m',
} as const

export function getLevelColor(level: string): string {
  switch (level) {
    case 'error':
      return colors.red
    case 'warn':
      return colors.yellow
    case 'info':
      return colors.cyan
    case 'debug':
      return colors.gray
    default:
      return colors.white
  }
}

/** Headers that should never be passed to hooks for security */
export const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]

export function filterSafeHeaders(headers: Record<string, string>): Record<string, string> {
  const safeHeaders: Record<string, string> = {}

  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      safeHeaders[key] = value
    }
  }

  return safeHeaders
}

/**
 * Match a path against a glob pattern.
 * Supports * (any chars except /) and ** (any chars including /).
 */
export function matchesPattern(path: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except * and ?
    .replace(/\*\*/g, '{{GLOBSTAR}}') // Temp placeholder for **
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/{{GLOBSTAR}}/g, '.*') // ** matches anything including /
    .replace(/\?/g, '[^/]') // ? matches single char except /

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(path)
}
