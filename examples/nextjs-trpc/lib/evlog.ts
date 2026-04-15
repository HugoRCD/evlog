import { createEvlog } from 'evlog/next'
import { createInstrumentation } from 'evlog/next/instrumentation'

export const { register, onRequestError } = createInstrumentation({
  service: 'nextjs-trpc-example',
})

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: 'nextjs-trpc-example',
  pretty: true,
})
