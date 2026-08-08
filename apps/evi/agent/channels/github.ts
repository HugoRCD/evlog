import { defaultGitHubAuth, githubChannel } from 'eve/channels/github'
import { connectGitHubCredentials } from '@vercel/connect/eve'
import { AUTONOMOUS_GITHUB_PRINCIPAL, MAINTAINER_GITHUB_ID } from '../lib/trust'

const botName = 'evlogai'
const mentionPattern = new RegExp(
  `@${botName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Za-z0-9_-])`,
  'iu',
)

export default githubChannel({
  botName,
  credentials: connectGitHubCredentials('github/evi-github-production'),
  onComment: (ctx, comment) => {
    if (ctx.sender.login.toLowerCase() !== 'hugorcd') return null
    if (!mentionPattern.test(comment.body)) return null
    return { auth: defaultGitHubAuth(ctx) }
  },
  onIssue: (ctx, issue) => {
    if (ctx.action !== 'opened') return null
    const login = ctx.sender.login.toLowerCase()
    // Community only: never the maintainer, never a bot (including our own loop).
    if (login === botName || login.endsWith('[bot]')) return null
    if (String(ctx.sender.id) === MAINTAINER_GITHUB_ID) return null
    if (issue.pull_request) return null
    // Unattended turn: the session runs as the bot, never as the issue opener.
    const auth = defaultGitHubAuth(ctx)
    return {
      auth: {
        ...auth,
        principalId: AUTONOMOUS_GITHUB_PRINCIPAL,
        principalType: 'service',
      },
    }
  },
})