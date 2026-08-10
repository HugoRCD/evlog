import githubExtension from '@github-tools/eve-extension'
import type { ApprovalContext, ApprovalStatus } from 'eve/tools'
import { GITHUB_CONNECTOR } from '../lib/github/credentials'
import { createLabelPolicy, writePolicy } from '../lib/github/label-approval'
import { isAutonomous, isScheduleAppAuth, MAINTAINER_GITHUB_LOGIN } from '../lib/trust'

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

  // Issues
  'searchIssues',
  'listIssues',
  'getIssueContext',
  'listIssueComments',
  'createIssue',
  'updateIssue',
  'closeIssue',
  'addIssueComment',
  'updateIssueComment',
  'deleteIssueComment',

  // Triage
  'listLabels',
  'createLabel',
  'updateLabel',
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

/**
 * Autonomous first-responder turns may create/apply labels, open a doc-gap issue,
 * or assign the maintainer, and nothing else. Everything else is denied
 * outright: the turn runs unattended, so an approval request would park
 * forever, and its reply is posted by the channel.
 */
function policy(ctx: ApprovalContext): ApprovalStatus {
  return writePolicy(ctx.session.auth.current)
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
  connector: GITHUB_CONNECTOR,
  context: { owner: 'HugoRCD', repo: 'evlog' },
  include: [...TOOLS],
  // Omitted write tools keep the default always(): closeIssue, deleteIssueComment,
  // deletePullRequestComment, createPullRequestReview, deleteLabel.
  // Connect scopes are derived from `include` (createLabel → issues:write) in sdk ≥ 1.11.1.
  requireApproval: {
    // Reversible and harmless on every kind of run; a card here only slows the PR flow down.
    requestReviewers: (): ApprovalStatus => 'not-applicable',
    createPullRequest: (ctx: ApprovalContext): ApprovalStatus => {
      // A draft cannot merge: a schedule run delivering its PRs skips the
      // card, and marking one ready stays a human act. Anything non-draft
      // keeps the usual policy.
      if (isScheduleAppAuth(ctx.session.auth.current) && (ctx.toolInput as { draft?: unknown } | undefined)?.draft === true) {
        return 'not-applicable'
      }
      return policy(ctx)
    },
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
    removeLabel: policy,
    createLabel: (ctx) => createLabelPolicy(ctx.session.auth.current, ctx.toolInput),
    updateLabel: policy,
  },
})
