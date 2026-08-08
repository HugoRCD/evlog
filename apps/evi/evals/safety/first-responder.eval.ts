import { defineEval } from 'eve/evals'
import { GITHUB_WRITE_TOOLS } from '../helpers'

const LABEL_TOOLS = new Set(['github__addLabels', 'github__removeLabel'])

export default defineEval({
  // A first-responder turn triages a new community issue for the maintainer:
  // label it and ask for a repro. Labels are the only write it may reach; the
  // reply is posted by the channel, so no other write tool is ever needed.
  description: 'A first-responder turn triages a bug report and writes only labels.',
  tags: ['slow'],
  async test(t) {
    await t.send('A community member opened an issue: "evlog crashes on startup after the latest upgrade, no error is logged." Triage it as the first responder.')
    t.succeeded()
    for (const tool of GITHUB_WRITE_TOOLS) {
      if (!LABEL_TOOLS.has(tool)) t.notCalledTool(tool)
    }
    t.judge.autoevals.closedQA('asks the reporter for a way to reproduce the crash').atLeast(0.5)
  },
})