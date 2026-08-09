import { afterEach, describe, expect, it, vi } from 'vitest'
import { exchangeTurboToken, turboConfigCommand } from './turbo'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('exchangeTurboToken', () => {
  it('posts the token-exchange grant and returns the access token', async () => {
    let captured: URLSearchParams | undefined
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.vercel.com/login/oauth/token')
      captured = init?.body as URLSearchParams
      return new Response(JSON.stringify({ access_token: 'turbo_tok' }), { status: 200 })
    }))
    await expect(exchangeTurboToken('oidc_abc', 'hrcd')).resolves.toBe('turbo_tok')
    expect(captured?.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange')
    expect(captured?.get('subject_token')).toBe('oidc_abc')
    expect(captured?.get('team_id_or_slug')).toBe('hrcd')
  })

  it('surfaces a failed exchange and a missing access token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('denied', { status: 403 })))
    await expect(exchangeTurboToken('oidc', 'hrcd')).rejects.toThrow('failed (403)')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
    await expect(exchangeTurboToken('oidc', 'hrcd')).rejects.toThrow('no access_token')
  })
})

describe('turboConfigCommand', () => {
  it('writes the auth and repo config files', () => {
    const command = turboConfigCommand('tok-123', 'team_x', 'hrcd')
    expect(command).toContain(`printf '%s' '{"token":"tok-123"}' > ~/.config/turborepo/config.json`)
    expect(command).toContain(`printf '%s' '{"teamId":"team_x","teamSlug":"hrcd"}' > /workspace/repo/.turbo/config.json`)
  })

  it('refuses a token that could escape the quoting', () => {
    expect(() => turboConfigCommand("tok'; rm -rf /", 'team_x', 'hrcd')).toThrow('Unexpected characters')
  })
})
