import { defineEval } from 'eve/evals'
import { includes } from 'eve/evals/expect'

export default defineEval({
  description: 'A documented-behavior question is answered from the docs connection and cited.',
  tags: ['slow'],
  async test(t) {
    await t.send('How does tail sampling work in evlog?')
    t.succeeded()
    t.calledTool('docs__get-page')
    t.check(t.reply, includes(/evlog\.dev\//))
    t.judge.autoevals.closedQA('cites a documentation URL it retrieved rather than describing the feature generically').atLeast(0.6)
  },
})
