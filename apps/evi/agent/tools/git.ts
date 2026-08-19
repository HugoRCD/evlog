import { useLogger } from 'evlog/eve'
import { defineDynamic, defineTool } from 'eve/tools'
import { z } from 'zod'
import { githubCredentials } from '../lib/github/credentials'
import { mintInstallationToken, pushBrokerPolicy, validatePushBranch } from '../lib/github/push'
import { isMaintainer, isScheduleAppAuth } from '../lib/trust'
import { REPO_DIR, runOutput } from '../lib/workspace'

/**
 * Pushes go to this URL literally, never through the `origin` remote: remote
 * config inside the sandbox is model-writable and must not be able to
 * redirect the brokered credential.
 */
const PUSH_URL = 'https://github.com/HugoRCD/evlog.git'

// Maintainer and schedule-app turns only; the push is inert (feature
// branches only). Keep executes inline in the resolver (docs/notes.md).
export default defineDynamic({
  events: {
    'turn.started': (_event, ctx) => {
      if (!isMaintainer(ctx.session.auth.current) && !isScheduleAppAuth(ctx.session.auth.current)) return null
      return {
        git__push: defineTool({
          description: `Push a local branch of the ${REPO_DIR} checkout to origin (HugoRCD/evlog). The branch must already exist there with the work committed and the checks run; main and master are refused. The credential is brokered at the sandbox firewall and never enters the sandbox. After a successful push, open the pull request with github__createPullRequest.`,
          inputSchema: z.object({
            branch: z.string().min(1).describe('Branch name in /workspace/repo to push, e.g. fix/pipeline-flush'),
          }),
          async execute(input, toolCtx) {
            if (!isMaintainer(toolCtx.session.auth.current) && !isScheduleAppAuth(toolCtx.session.auth.current)) {
              return { success: false as const, error: 'Only maintainer and schedule-app sessions may push.' }
            }
            const log = useLogger(toolCtx)
            const refusal = validatePushBranch(input.branch)
            if (refusal) {
              log.set({ git: { branch: input.branch, pushed: false, reason: 'refused' } })
              return { success: false as const, error: refusal }
            }
            const sandbox = await toolCtx.getSandbox()
            const token = await mintInstallationToken(githubCredentials)
            await sandbox.setNetworkPolicy(pushBrokerPolicy(token))
            try {
              const push = await sandbox.run({
                command: `git -C ${REPO_DIR} push ${PUSH_URL} 'refs/heads/${input.branch}:refs/heads/${input.branch}'`,
              })
              if (push.exitCode !== 0) {
                log.set({ git: { branch: input.branch, pushed: false, reason: `exit_${push.exitCode}` } })
                return { success: false as const, error: `git push exited ${push.exitCode}: ${runOutput(push)}` }
              }
              const head = await sandbox.run({ command: `git -C ${REPO_DIR} rev-parse '${input.branch}'` })
              const sha = String(head.stdout).trim()
              log.set({ git: { branch: input.branch, pushed: true, sha } })
              return {
                success: true as const,
                branch: input.branch,
                sha,
                repository: 'HugoRCD/evlog',
              }
            } finally {
              // Drop the brokered credential; the channel checkout re-brokers its own when it needs to fetch.
              await sandbox.setNetworkPolicy('allow-all')
            }
          },
        }),
      }
    },
  },
})
