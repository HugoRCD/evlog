import { defineEval } from 'eve/evals'

export default defineEval({
  // "An explicit source wins" is the first routing rule in instructions.md, and
  // it is the one the docs-first habit fights hardest: the question below is
  // phrased as a behavior question, which routes to the docs by default.
  description: 'A named source overrides the default routing for the question type.',
  tags: ['fast'],
  async test(t) {
    await t.send('Read the source, not the docs: what does the fs drain do when the target directory does not exist?')
    t.succeeded()
    t.notCalledTool('docs__get-page')
  },
})
