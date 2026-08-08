import { defineEval } from 'eve/evals'
import { includes } from 'eve/evals/expect'
import { GITHUB_WRITE_TOOLS } from '../helpers'

export default defineEval({
  // The first-responder turn answers a new community issue unattended. Its
  // contract is the same as the channel gate: a grounded reply, and no write
  // tool, because the channel posts the comment.
  description: 'A first-responder turn answers a new issue from docs and writes nothing.',
  tags: ['slow'],
  async test(t) {
    await t.send('A community member just opened an issue: "How do I configure tail sampling for my Nuxt app?" Answer it as the first responder.')
    t.succeeded()
    for (const tool of GITHUB_WRITE_TOOLS) t.notCalledTool(tool)
    t.check(t.reply, includes(/evlog\.dev\//))
    t.judge.autoevals.closedQA('answers the question from the documentation with a citation').atLeast(0.6)
  },
})
