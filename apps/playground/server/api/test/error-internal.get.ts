import { createError, useLogger } from 'evlog'

/**
 * Demo for createError({ internal }) — internal context is for drains / terminal logs only,
 * never included in the JSON error response.
 */
export default defineEventHandler((event) => {
  const log = useLogger(event)
  log.set({ demo: 'error-internal-playground' })

  throw createError({
    message: 'Demo: action not allowed',
    status: 403,
    why: 'This is a playground-only structured error (safe to show users).',
    fix: 'Use another playground button or ignore this message.',
    link: 'https://github.com/HugoRCD/evlog',
    internal: {
      supportRef: 'playground-support-ref-EVL140',
      gatewayCode: 'proc_declined_simulated',
      attemptedResource: '/api/test/error-internal',
    },
  })
})
