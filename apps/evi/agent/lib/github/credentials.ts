import { connectGitHubCredentials } from '@vercel/connect/eve'

/** The Connect connector shared by the GitHub channel, the extension, and the push tool. */
export const GITHUB_CONNECTOR = 'github/evi-github-production'

export const githubCredentials = connectGitHubCredentials(GITHUB_CONNECTOR)
