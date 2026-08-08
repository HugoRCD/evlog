import githubExtension from '@github-tools/eve-extension'
import type { ApprovalContext, ApprovalStatus } from 'eve/tools'
import { isAutonomous, isMaintainer } from '../lib/trust'

const TOOLS = [
  // Repository and code
  'getRepository',
  'getRepositoryTree',
  'getFileContent',
  'searchCode',
  'getBlame',
  'listBranches',
  'listCommits',
  'getCommit',
  'compareCommits',
  'createBranch',
  'createOrUpdateFile',

  // Issues
  'searchIssues',
  'listIssues',
  'getIssueContext',
  'createIssue',
  'updateIssue',
  'closeIssue',
  'addIssueComment',
  'updateIssueComment',
  'deleteIssueComment',

  // Triage
  'listLabels',
  'addLabels',
  'removeLabel',
  'addAssignees',
  'removeAssignees',
  'addIssueReaction',
  'addCommentReaction',

  // Pull requests
  'listPullRequests',
  'getPullRequestContext',
  'listPullRequestFiles',
  'listPullRequestReviews',
  'createPullRequest',
  'updatePullRequest',
  'addPullRequestComment',
  'updatePullRequestComment',
  'deletePullRequestComment',
  'createPullRequestReview',
  'requestReviewers',

  // Discussions
  'listDiscussions',
  'getDiscussion',
  'addDiscussionComment',

  // Releases, read only: AGENTS.md forbids agents from creating one
  'listReleases',
  'getLatestRelease',
  'getReleaseContext',

  // CI, read only — diagnose a red build, never restart or cancel one
  'listCheckRuns',
  'getCiFailureContext',
] as const

const PROTECTED_BRANCHES = new Set(['main', 'master'])

function maintainerWrite({ session }: ApprovalContext): ApprovalStatus {
  return isMaintainer(session.auth.current) ? 'not-applicable' : 'user-approval'
}

/**
 * Autonomous first-responder turns may label the issue they triage and nothing
 * else. Everything else is denied outright: the turn runs unattended, so an
 * approval request would park forever, and its reply is posted by the channel.
 */
function policy({ session }: ApprovalContext): ApprovalStatus {
  if (isAutonomous(session.auth.current)) {
    return { type: 'denied', reason: 'Autonomous turns may only add or update labels on the issue.' }
  }
  return maintainerWrite({ session })
}

/** Labels are reversible, so they are the one write an autonomous turn may reach. */
function labelPolicy(ctx: ApprovalContext): ApprovalStatus {
  return isAutonomous(ctx.session.auth.current) ? 'not-applicable' : policy(ctx)
}

export default githubExtension({
  connector: 'github/evi-github-production',
  connect: {
    scopes: [
      'metadata:read',
      'contents:read',
      'contents:write',
      'issues:read',
      'issues:write',
      'pull_requests:read',
      'pull_requests:write',
      'discussions:read',
      'discussions:write',
      'checks:read',
      'actions:read',
    ],
  },
  context: { owner: 'HugoRCD', repo: 'evlog' },
  include: [...TOOLS],
  // Omitted write tools keep the default always(): closeIssue, deleteIssueComment,
  // deletePullRequestComment, createPullRequestReview, requestReviewers.
  requireApproval: {
    createBranch: policy,
    createOrUpdateFile: (ctx: ApprovalContext): ApprovalStatus => {
      const branch = (ctx.toolInput as { branch?: string } | undefined)?.branch
      if (branch !== undefined && PROTECTED_BRANCHES.has(branch)) {
        return { type: 'denied', reason: `Direct writes to ${branch} are not allowed. Use a feature branch and a pull request.` }
      }
      return policy(ctx)
    },
    createPullRequest: policy,
    updatePullRequest: policy,
    createIssue: policy,
    updateIssue: policy,
    addIssueComment: policy,
    updateIssueComment: policy,
    addPullRequestComment: policy,
    updatePullRequestComment: policy,
    addDiscussionComment: policy,
    addAssignees: policy,
    removeAssignees: policy,
    addIssueReaction: policy,
    addCommentReaction: policy,
    addLabels: labelPolicy,
    removeLabel: labelPolicy,
  },
})