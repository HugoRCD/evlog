import { defineMcpClientConnection } from 'eve/connections'
import { adminOnlyAppConnection } from '../lib/connect'

/**
 * The full read surface plus the writes Evi's workflows need: issues,
 * comments, documents (`save_*` creates and updates), and initiatives
 * (`save_initiative` creates and edits, `save_initiative_update` posts a
 * status update). Deletes, diffs, attachments, and structural writes
 * (projects, releases) stay excluded. One list, maintained here.
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
  'save_initiative',
  'save_initiative_update',
  'save_issue',
]

/**
 * Linear's hosted MCP. The bearer token comes from a dedicated Connect
 * connector; Linear accepts it directly in the Authorization header, no
 * interactive OAuth hop.
 */
export default defineMcpClientConnection({
  url: 'https://mcp.linear.app/mcp',
  description: 'Hugo\'s Linear workspace (admin only): the authority on what is planned, in progress, or decided. Read issues, projects, initiatives, milestones, cycles, documents, and status updates; write via save_issue (create or update an issue), save_comment, save_document, save_initiative (create or edit an initiative), and save_initiative_update (post an initiative status update). Documents are the home for recurring reports like weekly digests, where formatting beats a chat message. Deletes and structural writes for projects and releases stay excluded.',
  tools: { allow: ALLOWED_TOOLS },
  auth: adminOnlyAppConnection('linear/mcp'),
})
