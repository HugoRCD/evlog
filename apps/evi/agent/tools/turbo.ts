import { getVercelOidcToken } from '@vercel/oidc'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { canAccessAdminTools } from '../lib/trust'
import { exchangeTurboToken, turboConfigCommand } from '../lib/turbo'

function turboTools() {
  return {
    turbo__enable_remote_cache: defineTool({
      description: "Connect the sandbox checkout to the team's Turborepo Remote Cache for this session. Call it once before running the checks: turbo then reuses artifacts CI already built instead of running every task cold. The short-lived token is written to turbo's own config files, never into a command. Run the checks with TURBO_REMOTE_CACHE_READ_ONLY=true so the sandbox never writes to the shared cache.",
      inputSchema: z.object({}),
      async execute(_input, ctx) {
        if (!canAccessAdminTools(ctx.session.auth.current)) {
          return { success: false as const, error: 'Remote cache access is not available in this session.' }
        }
        const teamSlug = process.env.TURBO_TEAM
        const teamId = process.env.VERCEL_TEAM_ID
        if (!teamSlug || !teamId) {
          return { success: false as const, error: 'TURBO_TEAM and VERCEL_TEAM_ID must be configured for remote caching.' }
        }
        // Fetched per call: the env token is minted at boot and expires on a warm instance.
        let oidc: string
        try {
          oidc = await getVercelOidcToken()
        }
        catch (error) {
          return { success: false as const, error: `No Vercel OIDC token available: ${error instanceof Error ? error.message : String(error)}` }
        }
        const token = await exchangeTurboToken(oidc, teamSlug)
        const sandbox = await ctx.getSandbox()
        const write = await sandbox.run({ command: turboConfigCommand(token, teamId, teamSlug) })
        if (write.exitCode !== 0) {
          return { success: false as const, error: `Writing the turbo config failed: ${String(write.stderr || write.stdout).trim()}` }
        }
        return {
          success: true as const,
          team: teamSlug,
          note: 'Remote cache connected for this session (token is short-lived). Prefix check commands with TURBO_REMOTE_CACHE_READ_ONLY=true.',
        }
      },
    }),
  }
}

/**
 * The token can only touch the remote cache, but a sandbox that runs untrusted
 * repro code must not hold it unattended: autonomous turns never see this
 * tool. Re-resolved every turn so the gate follows the turn's actual caller.
 */
export default defineDynamic({
  events: {
    'session.started': (_event, ctx) => (canAccessAdminTools(ctx.session.auth.current) ? turboTools() : null),
    'turn.started': (_event, ctx) => (canAccessAdminTools(ctx.session.auth.current) ? turboTools() : null),
  },
})
