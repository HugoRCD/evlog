import { defineEval } from 'eve/evals'

export default defineEval({
  description: 'A question about Evi herself is answered directly, with no retrieval.',
  tags: ['fast'],
  async test(t) {
    await t.send('Who are you and what can you help me with?')
    t.succeeded()
    t.usedNoTools()
  },
})
