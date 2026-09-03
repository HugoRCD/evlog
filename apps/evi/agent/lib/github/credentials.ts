import { connectGitHubCredentials } from '@vercel/connect/eve'

/** The Connect connector shared by the GitHub channel, the extension, and the push tool. */
export const GITHUB_CONNECTOR = 'github/evi-github-production'

// The connector's default installation is the retired one on the maintainer's
// account, and Connect exposes no way to change it: pin the evloghq one.
export const GITHUB_INSTALLATION_ID = '158603310'

export const githubCredentials = connectGitHubCredentials(GITHUB_CONNECTOR, { installationId: GITHUB_INSTALLATION_ID })
