import { defineEvalConfig } from 'eve/evals'
import { PostHogReporter } from './reporters/posthog'

export default defineEvalConfig({
  reporters: [PostHogReporter()],
  judge: {
    model: 'google/gemini-3.6-flash',
    // Judge calls bill to the same gateway key as the agent under test, so
    // without a tag of their own the two are one undifferentiated line in the
    // spend report. `evi:surface:judge` is what separates grading cost from
    // agent cost.
    modelOptions: {
      providerOptions: { gateway: { tags: ['evi:env:eval', 'evi:surface:judge'] } },
    },
  },
})
