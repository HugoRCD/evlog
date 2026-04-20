import { ToolLoopAgent, createAgentUIStreamResponse, stepCountIs } from 'ai'
import { createAILogger, createEvlogIntegration } from 'evlog/ai'
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

  const ai = createAILogger(logger, {
    toolInputs: true,
    cost: {
      'gemini-3-flash': { input: 0.1, output: 0.4 },
    },
  })

  ai.onUpdate((metadata) => {
    logger.set({
      aiLive: {
        step: metadata.calls,
        totalTokens: metadata.totalTokens,
        estimatedCost: metadata.estimatedCost,
        finishReason: metadata.finishReason,
      },
    })
  })

  try {
    const agent = new ToolLoopAgent({
      model: ai.wrap('google/gemini-3-flash'),
      instructions: systemPrompt,
      tools: { queryEvents },
      stopWhen: stepCountIs(5),
      experimental_telemetry: {
        isEnabled: true,
        integrations: [createEvlogIntegration(ai)],
      },
    })
    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      messageMetadata: ({ part }) => {
        if (part.type === 'finish-step' || part.type === 'finish') {
          const snapshot = ai.getMetadata()
          return {
            calls: snapshot.calls,
            totalTokens: snapshot.totalTokens,
            estimatedCost: snapshot.estimatedCost,
            finishReason: snapshot.finishReason,
          }
        }
      },
      onFinish: () => {
        logger.set({
          aiFinalMetadata: ai.getMetadata(),
          aiFinalCost: ai.getEstimatedCost(),
        })
      },
    })
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Error creating agent',
      cause: error,
    })
  }
})
