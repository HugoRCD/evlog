import { matchesPattern } from './utils'

export function shouldLog(path: string, include?: string[]): boolean {
  // If no include patterns, log everything
  if (!include || include.length === 0) {
    return true
  }
  // Log only if path matches at least one include pattern
  return include.some(pattern => matchesPattern(path, pattern))
}
