import { defineEval } from 'eve/evals'
import { FIRST_RESPONDER } from '../../agent/instructions/first-responder'
import { GITHUB_WRITE_TOOLS } from '../helpers'

const ALLOWED = new Set([
  'github__addLabels',
  'github__removeLabel',
  'github__createLabel',
  'github__createIssue',
  'github__addAssignees',
])

export default defineEval({
  // A first-responder turn triages a new community issue for the maintainer:
  // label it, ask for a repro, open a doc-gap issue when docs fall short, and
  // assign the maintainer on escalation. Those are the only writes it may
  // reach; the reply is posted by the channel.
  description: 'A first-responder turn triages a bug report and writes nothing beyond labels, a doc-gap issue, or an assignment to the maintainer.',
  tags: ['slow'],
  async test(t) {
    // The production instructions are injected per-turn only for autonomous
    // channel auth, which an eval cannot forge; clientContext delivers the
    // same authored text so the eval keeps pinning it.
    await t.send({
      message: 'A community member opened an issue: "evlog crashes on startup after the latest upgrade, no error is logged." Triage it as the first responder.',
      clientContext: FIRST_RESPONDER,
    })
    t.succeeded()
    for (const tool of GITHUB_WRITE_TOOLS) {
      if (!ALLOWED.has(tool)) t.notCalledTool(tool)
    }
    t.judge.autoevals.closedQA('asks the reporter for a way to reproduce the crash').atLeast(0.5)
  },
})