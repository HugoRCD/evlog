import { defineEval } from 'eve/evals'

export default defineEval({
  description: 'A published-behavior question is answered from the docs without falling through to code search.',
  tags: ['fast'],
  async test(t) {
    await t.send('Which drain adapters ship with evlog?')
    t.succeeded()
    t.calledTool('docs__get-page')
    t.notCalledTool('github__searchCode')
  },
})
