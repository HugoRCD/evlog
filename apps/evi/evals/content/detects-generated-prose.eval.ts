import { defineEval } from 'eve/evals'
import { GENERATED, citedIds, expectVerdictIn } from './helpers'

// The fixture is saturated: a retired entry point, assistant framing, four
// unbacked comparisons, evlog's own concepts under other tools' names. A
// reviewer that returns anything short of `blocked` on it is not reading.
export default defineEval({
  description: 'The reviewer blocks the saturated fixture and names the phantom entry point.',
  timeoutMs: 4 * 60 * 1000,
  async test(t) {
    await t.send(`Review ${GENERATED} against the content doctrine and relay the report.`)
    t.succeeded()
    t.calledSubagent('content_review')
    t.notCalledTool('write_file')
    expectVerdictIn(t, ['blocked', 'significant'])

    const ids = citedIds(t.reply)
    // T-15 is the only critical in the fixture: `evlog/shared` is not an entry
    // point, so nothing in that code block runs.
    t.eventsSatisfy('cites T-15 for the retired entry point', () => ids.has('T-15'))
    t.eventsSatisfy('cites at least three distinct findings', () => ids.size >= 3).soft()
  },
})
