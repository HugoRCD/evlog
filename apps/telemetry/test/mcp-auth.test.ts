import { afterEach, describe, expect, it } from 'vitest'
import { extractBearerToken, isMcpRequestAuthorized } from '../server/utils/mcp-auth'

afterEach(() => {
  delete process.env.ANALYTICS_PASSWORD
})

describe('extractBearerToken', () => {
  it('extracts the token from a well-formed Bearer header', () => {
    expect(extractBearerToken('Bearer secret-token')).toBe('secret-token')
  })

  it('is case-insensitive on the scheme', () => {
    expect(extractBearerToken('bearer secret-token')).toBe('secret-token')
  })

  it('trims surrounding whitespace', () => {
    expect(extractBearerToken('  Bearer   secret-token  ')).toBe('secret-token')
  })

  it('returns undefined for a missing header', () => {
    expect(extractBearerToken(undefined)).toBeUndefined()
  })

  it('returns undefined for a non-Bearer scheme', () => {
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeUndefined()
  })

  it('returns undefined for a blank token', () => {
    expect(extractBearerToken('Bearer ')).toBeUndefined()
  })
})

describe('isMcpRequestAuthorized', () => {
  it('allows any request when ANALYTICS_PASSWORD is unset', () => {
    delete process.env.ANALYTICS_PASSWORD
    expect(isMcpRequestAuthorized(undefined)).toBe(true)
    expect(isMcpRequestAuthorized('Bearer wrong')).toBe(true)
  })

  it('allows a matching bearer token once ANALYTICS_PASSWORD is set', () => {
    process.env.ANALYTICS_PASSWORD = 'super-secret'
    expect(isMcpRequestAuthorized('Bearer super-secret')).toBe(true)
  })

  it('rejects a missing or mismatched bearer token once ANALYTICS_PASSWORD is set', () => {
    process.env.ANALYTICS_PASSWORD = 'super-secret'
    expect(isMcpRequestAuthorized(undefined)).toBe(false)
    expect(isMcpRequestAuthorized('Bearer wrong')).toBe(false)
    expect(isMcpRequestAuthorized('Basic super-secret')).toBe(false)
  })
})
