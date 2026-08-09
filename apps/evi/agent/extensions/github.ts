import githubExtension from '@github-tools/eve-extension'
import type { ApprovalContext, ApprovalStatus } from 'eve/tools'
import { GITHUB_CONNECTOR } from '../lib/github/credentials'
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

function maintainerWrite(ctx: ApprovalContext): ApprovalStatus {
  return isMaintainer(ctx.session.auth.current) ? 'not-applicable' : 'user-approval'
}

/**
 * Autonomous first-responder turns may create/apply labels, open a doc-gap issue,
 * or assign the maintainer, and nothing else. Everything else is denied
 * outright: the turn runs unattended, so an approval request would park
 * forever, and its reply is posted by the channel.
 */
function policy(ctx: ApprovalContext): ApprovalStatus {
  if (isAutonomous(ctx.session.auth.current)) {
    return { type: 'denied', reason: 'Autonomous turns may only create or apply labels, open a doc-gap issue, or assign the maintainer.' }
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

const LABEL_NAME_MAX = 50
const LABEL_DESCRIPTION_MAX = 100
const LABEL_COLOR = /^[0-9a-fA-F]{6}$/

/**
 * Autonomous createLabel may grow the triage taxonomy, but only with a short
 * single-line name, a 6-digit hex color, and an optional short description —
 * not a free-form dump into the repo label set.
 */
function createLabelPolicy(ctx: ApprovalContext): ApprovalStatus {
  if (!isAutonomous(ctx.session.auth.current)) return policy(ctx)

  const input = ctx.toolInput as { name?: unknown, color?: unknown, description?: unknown } | undefined
  const name = typeof input?.name === 'string' ? input.name.trim() : ''
  const color = typeof input?.color === 'string' ? input.color.trim() : ''
  const description = input?.description === undefined || input?.description === null
    ? undefined
    : typeof input.description === 'string' ? input.description.trim() : null

  if (!name || name.length > LABEL_NAME_MAX || /[\n\r]/.test(name)) {
    return { type: 'denied', reason: 'Autonomous createLabel requires a short single-line name.' }
  }
  if (!LABEL_COLOR.test(color)) {
    return { type: 'denied', reason: 'Autonomous createLabel requires a 6-digit hex color.' }
  }
  if (description === null || (description !== undefined && (description.length > LABEL_DESCRIPTION_MAX || /[\n\r]/.test(description)))) {
    return { type: 'denied', reason: 'Autonomous createLabel description must be a short single line.' }
  }
  return 'not-applicable'
}

export default githubExtension({
  connector: GITHUB_CONNECTOR,
  context: { owner: 'HugoRCD', repo: 'evlog' },
  include: [...TOOLS],
  // Omitted write tools keep the default always(): closeIssue, deleteIssueComment,
  // deletePullRequestComment, createPullRequestReview, requestReviewers, deleteLabel.
  requireApproval: {
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
    removeLabel: policy,
    createLabel: createLabelPolicy,
    updateLabel: policy,
  },
})