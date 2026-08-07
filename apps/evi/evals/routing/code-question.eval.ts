import { defineEval } from 'eve/evals'
import { GITHUB_SOURCE_TOOLS, calledAnyTool } from '../helpers'

export default defineEval({
  // The inverse of docs-not-code: an implementation question the docs cannot
  // settle, where reading a page instead of the file is the failure.
  description: 'An implementation question reaches for the repository rather than the docs.',
  tags: ['fast'],
  async test(t) {
    await t.send('How is the batching in evlog/pipeline actually implemented — what triggers a flush?')
    t.succeeded()
    t.loadedSkill('source-research')
    calledAnyTool(t, 'read the repository', GITHUB_SOURCE_TOOLS)
  },
})
