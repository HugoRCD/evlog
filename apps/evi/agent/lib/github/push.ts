import type { GitHubChannelCredentials } from 'eve/channels/github'
import type { SandboxNetworkPolicy } from 'eve/sandbox'

const PROTECTED_BRANCHES = new Set(['main', 'master'])

/**
 * Conservative subset of valid git branch names: alphanumeric segments
 * separated by `.`, `_`, `-` or `/`. Everything the push command interpolates
 * has to match this, so shell metacharacters can never reach the command line.
 */
const BRANCH_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$/

/** Returns the refusal reason, or null when the branch may be pushed. */
export function validatePushBranch(branch: string): string | null {
  if (!BRANCH_PATTERN.test(branch) || branch.includes('..') || branch.includes('//')) {
    return `"${branch}" is not a valid branch name.`
  }
  if (PROTECTED_BRANCHES.has(branch)) {
    return `Direct pushes to ${branch} are not allowed. Push a feature branch and open a pull request.`
  }
  return null
}

/**
 * Firewall policy that brokers the installation token onto egress to
 * github.com only, mirroring the shape eve's own channel checkout uses. The
 * token never enters the sandbox process. `"*": []` keeps general egress open.
 */
export function pushBrokerPolicy(installationToken: string): SandboxNetworkPolicy {
  const authorization = `Basic ${Buffer.from(`x-access-token:${installationToken}`).toString('base64')}`
  return {
    allow: {
      'github.com': [{ transform: [{ headers: { Authorization: authorization } }] }],
      '*': [],
    },
  }
}

/** Resolves the Connect-managed installation token, minting when it is lazy. */
export async function mintInstallationToken(credentials: GitHubChannelCredentials): Promise<string> {
  const token = credentials.installationToken
  if (token === undefined) throw new Error('The GitHub connector exposes no installation token.')
  return typeof token === 'function' ? await token() : token
}
