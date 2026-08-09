import { createRemoteJWKSet, jwtVerify } from 'jose'

const TEAM_SLUG = 'hrcd'
const PROJECT = 'evi'
const ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`
/** Vercel mints one OIDC token per deployment; only the evi project's production tokens are trusted. */
const SUBJECT = `owner:${TEAM_SLUG}:project:${PROJECT}:environment:production`

const vercelJwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`))

/**
 * True when `token` is a Vercel OIDC token minted for the evi project's
 * production environment. The signature is verified against Vercel's team
 * JWKS, and jose rejects expired tokens. The `aud` claim is deliberately not
 * checked: `sub` already pins team, project and environment, and the
 * project's audience setting could be customized on the Vercel side.
 *
 * The keyset is injectable so unit tests verify against a local key instead
 * of the live JWKS.
 */
export async function isVercelOidcToken(
  token: string,
  jwks: ReturnType<typeof createRemoteJWKSet> = vercelJwks,
): Promise<boolean> {
  try {
    await jwtVerify(token, jwks, { issuer: ISSUER, subject: SUBJECT })
    return true
  } catch {
    return false
  }
}
