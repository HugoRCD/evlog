import { describe, expect, it } from 'vitest'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { isVercelOidcToken } from '../server/utils/vercel-oidc'

const ISSUER = 'https://oidc.vercel.com/hrcd'
const SUBJECT = 'owner:hrcd:project:evi:environment:production'

async function mint(claims: Record<string, string>, expiresAt?: number) {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwks = createLocalJWKSet({ keys: [await exportJWK(publicKey)] })
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setExpirationTime(expiresAt ?? Math.floor(Date.now() / 1000) + 600)
    .sign(privateKey)
  return { token, jwks }
}

describe('isVercelOidcToken', () => {
  it('accepts a token minted for the evi production project', async () => {
    const { token, jwks } = await mint({ iss: ISSUER, sub: SUBJECT })
    expect(await isVercelOidcToken(token, jwks)).toBe(true)
  })

  it('rejects a token for another project or environment', async () => {
    const { token, jwks } = await mint({
      iss: ISSUER,
      sub: 'owner:hrcd:project:evlog-docs:environment:production',
    })
    expect(await isVercelOidcToken(token, jwks)).toBe(false)
  })

  it('rejects a token from another issuer', async () => {
    const { token, jwks } = await mint({ iss: 'https://oidc.vercel.com/other-team', sub: SUBJECT })
    expect(await isVercelOidcToken(token, jwks)).toBe(false)
  })

  it('rejects an expired token', async () => {
    const { token, jwks } = await mint({ iss: ISSUER, sub: SUBJECT }, Math.floor(Date.now() / 1000) - 60)
    expect(await isVercelOidcToken(token, jwks)).toBe(false)
  })

  it('rejects a garbage token', async () => {
    const { publicKey } = await generateKeyPair('RS256')
    const jwks = createLocalJWKSet({ keys: [await exportJWK(publicKey)] })
    expect(await isVercelOidcToken('not-a-jwt', jwks)).toBe(false)
  })
})
