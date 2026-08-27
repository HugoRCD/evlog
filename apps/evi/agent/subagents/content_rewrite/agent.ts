import { defineAgent } from 'eve'
import { gatewayRouting, sessionTags } from '../../lib/gateway'
import { MODEL } from '../../lib/model'

export default defineAgent({
  model: MODEL,
  reasoning: 'high',
  modelOptions: {
    providerOptions: { gateway: { ...gatewayRouting(), tags: sessionTags('content') } },
  },
  description:
    'Apply a content review to one evlog page. Takes the review findings and edits only what they name, in the evlog voice, preserving MDC structure, frontmatter, and every link target. '
    + 'Verifies any code or API change against the package source before writing it. Writes the page in place and returns what changed with the id that justified each edit. '
    + 'Never edits a page it was not given findings for, and never invents findings of its own.',
})
