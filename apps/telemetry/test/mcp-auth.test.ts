import { afterEach, describe, expect, it, vi } from 'vitest'
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
  it('allows any request when ANALYTICS_PASSWORD is unset', async () => {
    delete process.env.ANALYTICS_PASSWORD
    expect(await isMcpRequestAuthorized(undefined)).toBe(true)
    expect(await isMcpRequestAuthorized('Bearer wrong')).toBe(true)
  })

  it('allows a matching bearer token once ANALYTICS_PASSWORD is set', async () => {
    process.env.ANALYTICS_PASSWORD = 'super-secret'
    expect(await isMcpRequestAuthorized('Bearer super-secret')).toBe(true)
  })

  it('rejects a missing or mismatched bearer token once ANALYTICS_PASSWORD is set', async () => {
    process.env.ANALYTICS_PASSWORD = 'super-secret'
    const noOidc = vi.fn(() => Promise.resolve(false))
    expect(await isMcpRequestAuthorized(undefined, noOidc)).toBe(false)
    expect(await isMcpRequestAuthorized('Bearer wrong', noOidc)).toBe(false)
    expect(await isMcpRequestAuthorized('Basic super-secret', noOidc)).toBe(false)
    expect(noOidc).toHaveBeenCalledTimes(1)
  })

  it('accepts a valid OIDC token once ANALYTICS_PASSWORD is set', async () => {
    process.env.ANALYTICS_PASSWORD = 'super-secret'
    const oidc = vi.fn(() => Promise.resolve(true))
    expect(await isMcpRequestAuthorized('Bearer oidc-token', oidc)).toBe(true)
  })
})
