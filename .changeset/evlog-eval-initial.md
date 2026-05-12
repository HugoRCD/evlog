---
'@evlog/eval': minor
---

Introduce `@evlog/eval` — an AI eval runner built on evlog primitives.

Define an eval with the familiar `dataset + task + scorers` pattern. Every case runs through a standalone `createLogger` + pre-wired `createAILogger`, so token usage, cache hits, tool calls, cost, and latency are captured automatically as part of the wide event — no extra instrumentation needed.

**Output scorers** (`@evlog/eval`): `exactMatch`, `contains`, `matches`, `llmJudge`, `notEmpty`, `lengthBetween`, `defineScorer`.

**AI-aware scorers** (`@evlog/eval/ai-scorers`): `maxSteps`, `maxCalls`, `noToolLoop`, `maxToolCallFrequency`, `minCacheHitRate`, `finishesCleanly`, `maxCost`, `maxLatency`, `maxTokensPerStep`, `minThroughput`. These score on the `ai.*` telemetry fields captured per case — useful for detecting runaway tool loops, measuring cache efficiency, and enforcing cost/latency budgets.

**Built-in drains** (`@evlog/eval/drains`): `jsonlDrain` (local NDJSON output, git-diffable) and `braintrustDrain` (sends results to Braintrust experiments via REST API, no SDK dependency). All existing evlog adapters (`axiomDrain`, `otlpDrain`, `datadogDrain`, …) work as eval drains without modification.

```ts
import { createEval, exactMatch, llmJudge } from '@evlog/eval'
import { maxSteps, noToolLoop, minCacheHitRate } from '@evlog/eval/ai-scorers'
import { braintrustDrain, jsonlDrain } from '@evlog/eval/drains'
import { axiomDrain } from 'evlog/axiom'

const myEval = createEval({
  name: 'triage-agent',
  dataset: [{ id: 'pr-1', input: { diff: '...' } }],
  task: async (input, { ai }) => {
    const model = ai.wrap('anthropic/claude-haiku-4')
    const { text } = await generateText({ model, prompt: `Triage: ${JSON.stringify(input)}` })
    return text
  },
  scorers: [
    exactMatch,
    maxSteps(8),
    noToolLoop(5),
    minCacheHitRate(0.2),
  ],
  drain: [
    braintrustDrain({ apiKey: process.env.BRAINTRUST_API_KEY!, projectName: 'my-app' }),
    axiomDrain({ dataset: 'evals' }),
    jsonlDrain(),
  ],
  concurrency: 10,
  trialCount: 3,
  threshold: 0.8,
})

const results = await myEval.run()
if (!results.passed) process.exit(1)
```
