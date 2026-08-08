import githubExtension from '@github-tools/eve-extension'
import type { ApprovalContext, ApprovalStatus } from 'eve/tools'
import { isMaintainer } from '../lib/trust'

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

/** Routine writes run without a card when Hugo asked; everyone else gets one. */
function maintainerWrite({ session }: ApprovalContext): ApprovalStatus {
  return isMaintainer(session.auth.current) ? 'not-applicable' : 'user-approval'
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
    createBranch: maintainerWrite,
    createOrUpdateFile: (ctx: ApprovalContext): ApprovalStatus => {
      const branch = (ctx.toolInput as { branch?: string } | undefined)?.branch
      if (branch !== undefined && PROTECTED_BRANCHES.has(branch)) {
        return { type: 'denied', reason: `Direct writes to ${branch} are not allowed. Use a feature branch and a pull request.` }
      }
      return maintainerWrite(ctx)
    },
    createPullRequest: maintainerWrite,
    updatePullRequest: maintainerWrite,
    createIssue: maintainerWrite,
    updateIssue: maintainerWrite,
    addIssueComment: maintainerWrite,
    updateIssueComment: maintainerWrite,
    addPullRequestComment: maintainerWrite,
    updatePullRequestComment: maintainerWrite,
    addDiscussionComment: maintainerWrite,
    addLabels: maintainerWrite,
    removeLabel: maintainerWrite,
    addAssignees: maintainerWrite,
    removeAssignees: maintainerWrite,
    addIssueReaction: maintainerWrite,
    addCommentReaction: maintainerWrite,
  },
})
