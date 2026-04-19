import { createEvlog } from 'evlog/next'
import { createInstrumentation } from 'evlog/next/instrumentation'
import { createHttpDrain } from './drain'

export const { register, onRequestError } = createInstrumentation({
  service: 'nextjs-trpc-example',
})

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: 'nextjs-trpc-example',
  pretty: true,
  drain: createHttpDrain({
    url: 'http://localhost:8080/ingest',
    token: process.env.NEXT_EXAMPLE_LOG_TOKEN || 'demo-token',
  }),
})
