import { defineMcpClientConnection } from 'eve/connections'
import { adminOnlyAppConnection } from '../lib/connect'

/**
 * The full read surface plus the three writes Evi's workflows need: issues,
 * comments, and documents (`save_*` creates and updates). Deletes, diffs,
 * attachments, and structural writes (projects, initiatives, releases) stay
 * excluded. One list, maintained here.
 */
const ALLOWED_TOOLS: string[] = [
  // Reads
  'get_document',
  'get_initiative',
  'get_issue',
  'get_issue_status',
  'get_milestone',
  'get_project',
  'get_team',
  'get_user',
  'get_workspace',
  'list_comments',
  'list_cycles',
  'list_documents',
  'list_initiative_labels',
  'list_initiatives',
  'list_issue_labels',
  'list_issue_statuses',
  'list_issues',
  'list_milestones',
  'list_project_labels',
  'list_projects',
  'list_teams',
  'list_users',
  'search_documentation',
  // Writes
  'save_comment',
  'save_document',
  'save_issue',
]

/**
 * Linear's hosted MCP. The bearer token comes from a dedicated Connect
 * connector; Linear accepts it directly in the Authorization header, no
 * interactive OAuth hop.
 */
export default defineMcpClientConnection({
  url: 'https://mcp.linear.app/mcp',
  description: "Hugo's Linear workspace (admin only): the authority on what is planned, in progress, or decided. Read issues, projects, initiatives, milestones, cycles, documents, and status updates; write via save_issue (create or update an issue), save_comment, and save_document — documents are the home for recurring reports like weekly digests, where formatting beats a chat message. No deletes and no structural writes.",
  tools: { allow: ALLOWED_TOOLS },
  auth: adminOnlyAppConnection('linear/mcp'),
})
