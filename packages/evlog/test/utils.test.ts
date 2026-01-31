import { describe, expect, it, vi } from 'vitest'
import { colors, formatDuration, getLevelColor, isClient, isDev, isServer, matchesPattern } from '../src/utils'

// Helper to test shouldLog logic (mirrors plugin.ts implementation)
function shouldLog(path: string, include?: string[], exclude?: string[]): boolean {
  if (exclude && exclude.length > 0) {
    if (exclude.some(pattern => matchesPattern(path, pattern))) {
      return false
    }
  }
  if (!include || include.length === 0) {
    return true
  }
  return include.some(pattern => matchesPattern(path, pattern))
}

describe('formatDuration', () => {
  it('formats milliseconds for duration < 1s', () => {
    expect(formatDuration(0)).toBe('0ms')
    expect(formatDuration(42)).toBe('42ms')
    expect(formatDuration(999)).toBe('999ms')
  })

  it('formats seconds for duration >= 1s', () => {
    expect(formatDuration(1000)).toBe('1.00s')
    expect(formatDuration(1500)).toBe('1.50s')
    expect(formatDuration(2345)).toBe('2.35s')
  })

  it('rounds milliseconds', () => {
    expect(formatDuration(42.7)).toBe('43ms')
    expect(formatDuration(42.3)).toBe('42ms')
  })
})

describe('isServer', () => {
  it('returns true in Node.js environment', () => {
    expect(isServer()).toBe(true)
  })
})

describe('isClient', () => {
  it('returns false in Node.js environment', () => {
    expect(isClient()).toBe(false)
  })
})

describe('isDev', () => {
  it('returns true when NODE_ENV is not production', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    expect(isDev()).toBe(true)
    process.env.NODE_ENV = originalEnv
  })

  it('returns false when NODE_ENV is production', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    expect(isDev()).toBe(false)
    process.env.NODE_ENV = originalEnv
  })

  it('returns true when NODE_ENV is test', () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    expect(isDev()).toBe(true)
    process.env.NODE_ENV = originalEnv
  })
})

describe('getLevelColor', () => {
  it('returns red for error', () => {
    expect(getLevelColor('error')).toBe(colors.red)
  })

  it('returns yellow for warn', () => {
    expect(getLevelColor('warn')).toBe(colors.yellow)
  })

  it('returns cyan for info', () => {
    expect(getLevelColor('info')).toBe(colors.cyan)
  })

  it('returns gray for debug', () => {
    expect(getLevelColor('debug')).toBe(colors.gray)
  })

  it('returns white for unknown level', () => {
    expect(getLevelColor('unknown')).toBe(colors.white)
  })
})

describe('colors', () => {
  it('has all required color codes', () => {
    expect(colors.reset).toBe('\x1B[0m')
    expect(colors.bold).toBe('\x1B[1m')
    expect(colors.dim).toBe('\x1B[2m')
    expect(colors.red).toBe('\x1B[31m')
    expect(colors.green).toBe('\x1B[32m')
    expect(colors.yellow).toBe('\x1B[33m')
    expect(colors.blue).toBe('\x1B[34m')
    expect(colors.cyan).toBe('\x1B[36m')
    expect(colors.gray).toBe('\x1B[90m')
  })
})

describe('matchesPattern', () => {
  describe('exact matches', () => {
    it('matches exact path', () => {
      expect(matchesPattern('/api/users', '/api/users')).toBe(true)
    })

    it('does not match different path', () => {
      expect(matchesPattern('/api/users', '/api/posts')).toBe(false)
    })
  })

  describe('single wildcard (*)', () => {
    it('matches single segment', () => {
      expect(matchesPattern('/api/users', '/api/*')).toBe(true)
      expect(matchesPattern('/api/posts', '/api/*')).toBe(true)
    })

    it('does not match nested segments', () => {
      expect(matchesPattern('/api/users/123', '/api/*')).toBe(false)
    })

    it('matches in middle of path', () => {
      expect(matchesPattern('/api/users/list', '/api/*/list')).toBe(true)
    })
  })

  describe('double wildcard (**)', () => {
    it('matches any depth', () => {
      expect(matchesPattern('/api/users', '/api/**')).toBe(true)
      expect(matchesPattern('/api/users/123', '/api/**')).toBe(true)
      expect(matchesPattern('/api/users/123/posts', '/api/**')).toBe(true)
    })

    it('matches at any position', () => {
      expect(matchesPattern('/v1/api/users', '/**/users')).toBe(true)
      expect(matchesPattern('/api/v2/users', '/**/users')).toBe(true)
    })
  })

  describe('question mark (?)', () => {
    it('matches single character', () => {
      expect(matchesPattern('/api/v1', '/api/v?')).toBe(true)
      expect(matchesPattern('/api/v2', '/api/v?')).toBe(true)
    })

    it('does not match multiple characters', () => {
      expect(matchesPattern('/api/v10', '/api/v?')).toBe(false)
    })

    it('does not match slash', () => {
      expect(matchesPattern('/api/v/', '/api/v?')).toBe(false)
    })
  })

  describe('special regex characters', () => {
    it('escapes dots', () => {
      expect(matchesPattern('/api/v1.0', '/api/v1.0')).toBe(true)
      expect(matchesPattern('/api/v1x0', '/api/v1.0')).toBe(false)
    })

    it('escapes brackets', () => {
      expect(matchesPattern('/api/[test]', '/api/[test]')).toBe(true)
    })

    it('escapes parentheses', () => {
      expect(matchesPattern('/api/(group)', '/api/(group)')).toBe(true)
    })

    it('escapes plus sign', () => {
      expect(matchesPattern('/api/a+b', '/api/a+b')).toBe(true)
    })

    it('escapes caret', () => {
      expect(matchesPattern('/api/^start', '/api/^start')).toBe(true)
    })

    it('escapes dollar sign', () => {
      expect(matchesPattern('/api/end$', '/api/end$')).toBe(true)
    })

    it('escapes pipe', () => {
      expect(matchesPattern('/api/a|b', '/api/a|b')).toBe(true)
    })

    it('escapes backslash', () => {
      expect(matchesPattern('/api/a\\b', '/api/a\\b')).toBe(true)
    })
  })

  describe('combined patterns', () => {
    it('combines * and **', () => {
      expect(matchesPattern('/api/v1/users/123', '/api/*/users/**')).toBe(true)
      expect(matchesPattern('/api/v2/users/123/posts', '/api/*/users/**')).toBe(true)
    })

    it('handles complex patterns', () => {
      expect(matchesPattern('/api/v1.0/users', '/api/v?.?/**')).toBe(true)
    })
  })

  describe('boundary conditions', () => {
    it('handles empty path', () => {
      expect(matchesPattern('', '')).toBe(true)
      expect(matchesPattern('', '**')).toBe(true)
      expect(matchesPattern('/api', '')).toBe(false)
    })

    it('handles root path', () => {
      expect(matchesPattern('/', '/')).toBe(true)
      expect(matchesPattern('/', '/**')).toBe(true)
    })

    it('is case sensitive', () => {
      expect(matchesPattern('/API/users', '/api/users')).toBe(false)
    })
  })
})

describe('shouldLog', () => {
  describe('no filters', () => {
    it('logs everything when no include or exclude', () => {
      expect(shouldLog('/api/users')).toBe(true)
      expect(shouldLog('/health')).toBe(true)
      expect(shouldLog('/')).toBe(true)
    })

    it('logs everything with empty arrays', () => {
      expect(shouldLog('/api/users', [], [])).toBe(true)
      expect(shouldLog('/health', [], [])).toBe(true)
    })
  })

  describe('include only', () => {
    it('logs matching paths', () => {
      expect(shouldLog('/api/users', ['/api/**'])).toBe(true)
      expect(shouldLog('/api/posts/123', ['/api/**'])).toBe(true)
    })

    it('does not log non-matching paths', () => {
      expect(shouldLog('/health', ['/api/**'])).toBe(false)
      expect(shouldLog('/auth/login', ['/api/**'])).toBe(false)
    })

    it('supports multiple include patterns', () => {
      expect(shouldLog('/api/users', ['/api/**', '/auth/**'])).toBe(true)
      expect(shouldLog('/auth/login', ['/api/**', '/auth/**'])).toBe(true)
      expect(shouldLog('/health', ['/api/**', '/auth/**'])).toBe(false)
    })
  })

  describe('exclude only', () => {
    it('logs non-matching paths', () => {
      expect(shouldLog('/api/users', undefined, ['/health'])).toBe(true)
      expect(shouldLog('/api/posts', undefined, ['/api/_nuxt_icon/**'])).toBe(true)
    })

    it('does not log matching exclude paths', () => {
      expect(shouldLog('/health', undefined, ['/health'])).toBe(false)
      expect(shouldLog('/api/_nuxt_icon/foo', undefined, ['/api/_nuxt_icon/**'])).toBe(false)
    })

    it('supports multiple exclude patterns', () => {
      expect(shouldLog('/api/users', undefined, ['/health', '/api/_nuxt_icon/**'])).toBe(true)
      expect(shouldLog('/health', undefined, ['/health', '/api/_nuxt_icon/**'])).toBe(false)
      expect(shouldLog('/api/_nuxt_icon/bar', undefined, ['/health', '/api/_nuxt_icon/**'])).toBe(false)
    })
  })

  describe('include and exclude combined', () => {
    it('excludes take precedence over includes', () => {
      // Path matches include but also matches exclude -> excluded
      expect(shouldLog('/api/_nuxt_icon/foo', ['/api/**'], ['/api/_nuxt_icon/**'])).toBe(false)
    })

    it('logs paths matching include but not exclude', () => {
      expect(shouldLog('/api/users', ['/api/**'], ['/api/_nuxt_icon/**'])).toBe(true)
      expect(shouldLog('/api/posts/123', ['/api/**'], ['/api/_nuxt_icon/**'])).toBe(true)
    })

    it('does not log paths not matching include', () => {
      expect(shouldLog('/health', ['/api/**'], ['/api/_nuxt_icon/**'])).toBe(false)
    })

    it('handles complex filtering scenarios', () => {
      const include = ['/api/**', '/auth/**']
      const exclude = ['/api/_nuxt_icon/**', '/api/health', '/auth/internal/**']

      expect(shouldLog('/api/users', include, exclude)).toBe(true)
      expect(shouldLog('/auth/login', include, exclude)).toBe(true)
      expect(shouldLog('/api/_nuxt_icon/icon.svg', include, exclude)).toBe(false)
      expect(shouldLog('/api/health', include, exclude)).toBe(false)
      expect(shouldLog('/auth/internal/debug', include, exclude)).toBe(false)
      expect(shouldLog('/public/assets', include, exclude)).toBe(false)
    })
  })

  describe('real-world use cases', () => {
    it('excludes nuxt icon routes from API logging', () => {
      const include = ['/api/**']
      const exclude = ['/api/_nuxt_icon/**']

      expect(shouldLog('/api/users', include, exclude)).toBe(true)
      expect(shouldLog('/api/_nuxt_icon/mdi:home', include, exclude)).toBe(false)
      expect(shouldLog('/api/_nuxt_icon/lucide:check', include, exclude)).toBe(false)
    })

    it('excludes health checks', () => {
      const exclude = ['/health', '/healthz', '/ready']

      expect(shouldLog('/api/users', undefined, exclude)).toBe(true)
      expect(shouldLog('/health', undefined, exclude)).toBe(false)
      expect(shouldLog('/healthz', undefined, exclude)).toBe(false)
      expect(shouldLog('/ready', undefined, exclude)).toBe(false)
    })

    it('excludes static assets', () => {
      const include = ['/api/**']
      const exclude = ['/api/_content/**', '/api/_nuxt_icon/**']

      expect(shouldLog('/api/users', include, exclude)).toBe(true)
      expect(shouldLog('/api/_content/query', include, exclude)).toBe(false)
      expect(shouldLog('/api/_nuxt_icon/foo', include, exclude)).toBe(false)
    })
  })
})
