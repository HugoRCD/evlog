import { githubChannel } from 'eve/channels/github'
import { connectGitHubCredentials } from '@vercel/connect/eve'

export default githubChannel({
  botName: 'evlogai',
  credentials: connectGitHubCredentials('github/evi-github'),
})
