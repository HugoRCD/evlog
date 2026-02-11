import { ToolLoopAgent, createAgentUIStreamResponse, stepCountIs } from 'ai'
import { queryEvents } from '../tools/query-events'

const systemPrompt = `You are a helpful assistant that analyzes application logs stored in a SQLite database.

## Table: evlog_events

Columns:
- id (text, primary key) — UUID
- timestamp (text) — ISO-8601 timestamp of the request
- level (text) — "error", "warn", "info", or "debug"
- service (text) — service name (e.g. "nuxthub-playground")
- environment (text) — e.g. "development", "production"
- method (text, nullable) — HTTP method (GET, POST, etc.)
- path (text, nullable) — request path (e.g. "/api/test/error")
- status (integer, nullable) — HTTP status code
- duration_ms (integer, nullable) — request duration in milliseconds
- request_id (text, nullable) — unique request identifier
- source (text, nullable) — source of the log
- error (text, nullable) — JSON string containing error details
- data (text, nullable) — JSON string containing arbitrary business data
- created_at (text) — ISO-8601 creation timestamp

## JSON column structure

The \`error\` column, when present, is a JSON string with this structure:
{
  "name": "ErrorName",
  "message": "Error description",
  "statusCode": 500,
  "data": {
    "why": "Explanation of why this error occurred",
    "fix": "Suggested fix for this error",
    "link": "URL to relevant documentation"
  }
}

The \`data\` column stores arbitrary JSON. Common fields include:
- action: what the request was doing
- user: user information (id, plan, etc.)
- result: outcome of the operation
- itemsProcessed: number of items processed

## SQLite JSON queries

Use json_extract() for querying JSON columns. Examples:
- json_extract(error, '$.message') — get error message
- json_extract(error, '$.data.why') — get error explanation
- json_extract(data, '$.action') — get action from data

## Instructions

- When asked about errors, query for level = 'error' and include the error column details (why, fix, link).
- When analyzing logs, provide clear summaries with counts and patterns.
- Always order by created_at DESC to show most recent first unless asked otherwise.
- Limit queries to 50 rows max.
- Only use SELECT queries — never modify data.`

export default defineEventHandler(async (event) => {
  const logger = useLogger(event)
  const { messages } = await readBody(event)

  logger.set({ action: 'chat', messagesCount: messages.length })

  const agent = new ToolLoopAgent({
    model: 'google/gemini-3-flash',
    instructions: systemPrompt,
    tools: { queryEvents },
    stopWhen: stepCountIs(5),
    onFinish: ({ steps }) => {
      const totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      const toolCalls: string[] = []

      for (const step of steps) {
        totalUsage.inputTokens += step.usage?.inputTokens ?? 0
        totalUsage.outputTokens += step.usage?.outputTokens ?? 0
        totalUsage.totalTokens += step.usage?.totalTokens ?? 0

        for (const tc of step.toolCalls ?? []) {
          toolCalls.push(tc.toolName)
        }
      }

      const lastStep = steps.at(-1)

      logger.set({
        ai: {
          model: lastStep?.response?.modelId ?? 'google/gemini-3-flash',
          steps: steps.length,
          finishReason: lastStep?.finishReason,
          usage: totalUsage,
          toolCalls,
        },
      })
    },
  })

  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  })
})
