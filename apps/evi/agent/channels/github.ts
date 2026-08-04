import { defaultGitHubAuth, githubChannel } from 'eve/channels/github'
import { connectGitHubCredentials } from '@vercel/connect/eve'

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
})
