import { generateText, tool, jsonSchema } from 'ai'
import { initLogger } from 'evlog'
import { createEval, defineScorer } from '@evlog/eval'
import { maxSteps, noToolLoop, finishesCleanly, maxCost } from '@evlog/eval/ai-scorers'
import { jsonlDrain } from '@evlog/eval/drains'
import { z } from 'zod'

initLogger({
  env: { service: 'eval-example', environment: 'development' },
  pretty: true,
})

const getWeather = tool({
  description: 'Get the current weather for a city',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    const temps: Record<string, number> = { Paris: 18, London: 14, Tokyo: 22 }
    return { city, tempC: temps[city] ?? 15, condition: 'partly cloudy' }
  },
})

const myEval = createEval({
  name: 'agent-eval',
  dataset: [
    { id: 'weather', input: 'What is the weather in Paris?' },
    { id: 'math', input: 'What is 12 * 8?' },
    { id: 'both', input: 'What is the weather in Tokyo and what is 5 + 5?' },
  ],

  task: async (input, { ai }) => {
    const model = ai.wrap('google/gemini-3-flash')
    const { text } = await generateText({
      model,
      tools: { getWeather },
      prompt: input,
    })
    return text
  },

  scorers: [
    defineScorer({ name: 'has-response', score: ({ output }) => String(output).trim().length > 0 }),
    maxSteps(4),
    noToolLoop(3),
    finishesCleanly,
    maxCost(0.005),
  ],

  aiOptions: {
    cost: { 'gemini-3-flash': { input: 0.1, output: 0.4 } },
  },

  drain: jsonlDrain(),
  concurrency: 3,
  threshold: 0.8,
})

const results = await myEval.run()

console.log(`\nPass rate: ${(results.passRate * 100).toFixed(0)}% (${results.passing}/${results.total})`)
if (results.estimatedCost !== undefined)
  console.log(`Cost: $${results.estimatedCost.toFixed(6)}`)
console.log(`P95: ${results.p95DurationMs}ms\n`)

for (const c of results.cases) {
  const icon = c.passed ? '✅' : '❌'
  const { ai } = c
  console.log(`${icon} [${c.id}] ${String(c.output).slice(0, 80)}`)
  if (ai) console.log(`   steps=${ai.steps ?? 1} calls=${ai.calls} finish=${ai.finishReason} tools=${JSON.stringify(ai.toolCalls ?? [])}`)
  console.log(`   scores:`, c.scores)
  if (c.error) console.log(`   error:`, c.error)
}

if (!results.passed) process.exit(1)
