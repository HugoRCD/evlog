import githubExtension from '@github-tools/eve-extension'

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
})
