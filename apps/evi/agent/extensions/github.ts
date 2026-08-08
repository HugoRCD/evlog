import githubExtension from '@github-tools/eve-extension'
import type { ApprovalContext, ApprovalStatus } from 'eve/tools'
import { isAutonomous, isMaintainer, MAINTAINER_GITHUB_LOGIN } from '../lib/trust'

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

function maintainerWrite(ctx: ApprovalContext): ApprovalStatus {
  return isMaintainer(ctx.session.auth.current) ? 'not-applicable' : 'user-approval'
}

/**
 * Autonomous first-responder turns may label the issue, open a doc-gap issue,
 * or assign the maintainer, and nothing else. Everything else is denied
 * outright: the turn runs unattended, so an approval request would park
 * forever, and its reply is posted by the channel.
 */
function policy(ctx: ApprovalContext): ApprovalStatus {
  if (isAutonomous(ctx.session.auth.current)) {
    return { type: 'denied', reason: 'Autonomous turns may only label the issue, open a doc-gap issue, or assign the maintainer.' }
  }
  return maintainerWrite(ctx)
}

/** The writes an autonomous turn may reach: reversible and low blast radius. */
function autonomousWrite(ctx: ApprovalContext): ApprovalStatus {
  return isAutonomous(ctx.session.auth.current) ? 'not-applicable' : policy(ctx)
}

/** Escalation: an autonomous turn assigns the issue to the maintainer, and no one else. */
function assignPolicy(ctx: ApprovalContext): ApprovalStatus {
  if (isAutonomous(ctx.session.auth.current)) {
    const assignees = (ctx.toolInput as { assignees?: unknown } | undefined)?.assignees
    const ok = Array.isArray(assignees)
      && assignees.length > 0
      && assignees.every((assignee) => String(assignee).toLowerCase() === MAINTAINER_GITHUB_LOGIN)
    return ok ? 'not-applicable' : { type: 'denied', reason: `Autonomous turns may only assign ${MAINTAINER_GITHUB_LOGIN}.` }
  }
  return policy(ctx)
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
    createIssue: autonomousWrite,
    updateIssue: policy,
    addIssueComment: policy,
    updateIssueComment: policy,
    addPullRequestComment: policy,
    updatePullRequestComment: policy,
    addDiscussionComment: policy,
    addAssignees: assignPolicy,
    removeAssignees: policy,
    addIssueReaction: policy,
    addCommentReaction: policy,
    addLabels: autonomousWrite,
    removeLabel: autonomousWrite,
  },
})