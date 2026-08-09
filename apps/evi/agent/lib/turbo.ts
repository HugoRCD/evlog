/** Public client id of Vercel's OIDC → Turborepo token exchange (from the Remote Caching docs). */
const EXCHANGE_CLIENT_ID = 'cl_kyUx2zVvA4MGptBohkmtYHJly2XltXzD'

const EXCHANGE_URL = 'https://api.vercel.com/login/oauth/token'

/**
 * Exchanges the runtime's Vercel OIDC token for a short-lived Turborepo access
 * token: scoped to Remote Cache only and tied to the team, so even read from
 * inside the sandbox it grants nothing beyond cache access.
 */
export async function exchangeTurboToken(oidcToken: string, team: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    client_id: EXCHANGE_CLIENT_ID,
    subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    team_id_or_slug: team,
    subject_token: oidcToken,
  })
  const response = await fetch(EXCHANGE_URL, { method: 'POST', body, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    throw new Error(`Turborepo token exchange failed (${response.status}): ${await response.text()}`)
  }
  const payload = await response.json() as { access_token?: unknown }
  const token = payload?.access_token
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Turborepo token exchange returned no access_token.')
  }
  return token
}

/**
 * Shell command writing turbo's auth and repo config inside the sandbox, so
 * `turbo` finds the token and team on its own and no credential ever appears
 * in a model-composed command. The token is base64url material: safe inside
 * single quotes.
 */
export function turboConfigCommand(token: string, teamId: string, teamSlug: string): string {
  // All three land inside single quotes; refusing anything outside this
  // charset (which real tokens, team ids, and slugs never leave) beats escaping.
  for (const [name, value] of [['token', token], ['teamId', teamId], ['teamSlug', teamSlug]] as const) {
    if (!/^[\w.-]+$/.test(value)) throw new Error(`Unexpected characters in the Turborepo ${name}.`)
  }
  const auth = JSON.stringify({ token })
  const repo = JSON.stringify({ teamId, teamSlug })
  return [
    'mkdir -p ~/.config/turborepo /workspace/repo/.turbo',
    `printf '%s' '${auth}' > ~/.config/turborepo/config.json`,
    `printf '%s' '${repo}' > /workspace/repo/.turbo/config.json`,
  ].join(' && ')
}
