import type { EveEvalContext } from 'eve/evals'

/**
 * Gate that at least one of `names` was requested.
 *
 * `t.calledTool` pins a single tool, which over-specifies whenever several are
 * legitimate — a source question is equally well served by `searchCode` or by
 * `getFileContent`, and an eval that insists on one of them fails on a correct
 * run. Tool calls arrive as `tool-call` actions inside `actions.requested`.
 */
export function calledAnyTool(t: EveEvalContext, label: string, names: readonly string[]) {
  const wanted = new Set(names)
  return t.eventsSatisfy(label, events =>
    events.some(event =>
      event.type === 'actions.requested'
      && event.data.actions.some(action => action.kind === 'tool-call' && wanted.has(action.toolName)),
    ),
  )
}

/** Every tool that writes to the repository. A read-only turn must call none of them. */
export const GITHUB_WRITE_TOOLS = [
  'git__push',
  'github__createIssue',
  'github__updateIssue',
  'github__closeIssue',
  'github__addIssueComment',
  'github__updateIssueComment',
  'github__createLabel',
  'github__updateLabel',
  'github__addLabels',
  'github__removeLabel',
  'github__addAssignees',
  'github__removeAssignees',
  'github__createPullRequest',
  'github__updatePullRequest',
  'github__addPullRequestComment',
  'github__updatePullRequestComment',
  'github__createPullRequestReview',
  'github__requestReviewers',
  'github__addDiscussionComment',
] as const

/** Repository read tools any source-level question could reasonably reach for. */
const GITHUB_SOURCE_TOOLS = [
  'github__searchCode',
  'github__getFileContent',
  'github__getRepositoryTree',
  'github__getBlame',
] as const

/**
 * Reading source, whichever way. The API is the cheaper route off the GitHub
 * channel and the checkout is the cheaper one on it, so an eval that accepts
 * only one of them gates on the environment rather than on the routing
 * decision. `bash` is left out: it reads source among a hundred other things.
 */
export const SOURCE_READ_TOOLS = [
  ...GITHUB_SOURCE_TOOLS,
  'grep',
  'glob',
  'read_file',
] as const

/** The tools that answer "is this already known". */
export const GITHUB_ISSUE_SEARCH_TOOLS = [
  'github__searchIssues',
  'github__listIssues',
  'github__getIssueContext',
] as const
