import { defineNodeInstrumentation } from 'evlog/next/instrumentation'

export const { register, onRequestError } = defineNodeInstrumentation(() => import('./lib/evlog'))
