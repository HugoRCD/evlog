import { defineMcpClientConnection } from 'eve/connections'
import { adminOnlyAppConnection } from '../lib/connect'

/**
 * The full read surface plus the writes Evi's workflows need: issues,
 * comments, documents, initiatives, and status updates (`save_*` creates and
 * updates). `save_status_update` covers project and initiative updates alike,
 * so posting a project report is in scope while structural project writes are
 * not. Deletes, diffs, attachments, and structural writes (projects,
 * releases, milestones) stay excluded. One list, maintained here.
 */
const ALLOWED_TOOLS: string[] = [
  // Reads
  'get_document',
  'get_initiative',
  'get_issue',
  'get_issue_status',
  'get_milestone',
  'get_project',
  'get_status_updates',
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
  'save_issue',
  'save_status_update',
]

/**
 * Linear's hosted MCP. The bearer token comes from a dedicated Connect
 * connector; Linear accepts it directly in the Authorization header, no
 * interactive OAuth hop.
 */
export default defineMcpClientConnection({
  url: 'https://mcp.linear.app/mcp',
  description: 'Hugo\'s Linear workspace (admin only): the authority on what is planned, in progress, or decided. Read issues, projects, initiatives, milestones, cycles, documents, and status updates; write via save_issue (create or update an issue), save_comment, save_document, save_initiative (create or edit an initiative), and save_status_update (post a project or initiative update, with a health signal). Documents are the home for recurring reports like weekly digests, where formatting beats a chat message. Deletes and structural writes for projects, releases, and milestones stay excluded.',
  tools: { allow: ALLOWED_TOOLS },
  auth: adminOnlyAppConnection('linear/mcp'),
})
