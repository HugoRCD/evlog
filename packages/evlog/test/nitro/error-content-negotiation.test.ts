import { describe, expect, it } from 'vitest'
import { shouldSerializeNitroErrorAsJson, type NitroErrorRequestContext } from '../../src/nitro'

function request(
  pathname: string,
  headers: Record<string, string> = {},
): NitroErrorRequestContext {
  return {
    pathname,
    getHeader: name => headers[name.toLowerCase()] ?? headers[name],
  }
}

describe('shouldSerializeNitroErrorAsJson', () => {
  const evlogError = Object.assign(new Error('structured'), { name: 'EvlogError' })

  it('always serializes EvlogError even for HTML navigation', () => {
    expect(shouldSerializeNitroErrorAsJson(
      request('/about', { accept: 'text/html', 'sec-fetch-dest': 'document' }),
      evlogError,
    )).toBe(true)
  })

  it('delegates plain SSR errors on HTML document requests', () => {
    expect(shouldSerializeNitroErrorAsJson(
      request('/user/does-not-exist', {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'sec-fetch-dest': 'document',
      }),
      null,
    )).toBe(false)
  })

  it('delegates plain errors when Sec-Fetch-Mode is navigate', () => {
    expect(shouldSerializeNitroErrorAsJson(
      request('/missing', { 'sec-fetch-mode': 'navigate' }),
      null,
    )).toBe(false)
  })

  it('serializes plain errors on API routes', () => {
    expect(shouldSerializeNitroErrorAsJson(
      request('/api/users', { accept: 'text/html' }),
      null,
    )).toBe(true)
  })

  it('serializes plain errors on the /api root path', () => {
    expect(shouldSerializeNitroErrorAsJson(
      request('/api', { accept: 'text/html', 'sec-fetch-dest': 'document' }),
      null,
    )).toBe(true)
  })

  it('serializes plain errors for JSON-only Accept headers', () => {
    expect(shouldSerializeNitroErrorAsJson(
      request('/page', { accept: 'application/json' }),
      null,
    )).toBe(true)
  })

  it('serializes plain errors for XMLHttpRequest clients', () => {
    expect(shouldSerializeNitroErrorAsJson(
      request('/page', {
        accept: 'text/html',
        'x-requested-with': 'XMLHttpRequest',
      }),
      null,
    )).toBe(true)
  })

  it('serializes plain errors for fetch-like requests without HTML signals', () => {
    expect(shouldSerializeNitroErrorAsJson(
      request('/throws-plain', { accept: '*/*' }),
      null,
    )).toBe(true)
  })
})
