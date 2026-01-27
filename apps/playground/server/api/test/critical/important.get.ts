// Critical path - should always be logged due to path pattern matching
export default defineEventHandler((event) => {
  const log = useLogger(event)

  log.set({ scenario: 'critical-path' })

  return {
    message: 'Critical path request - always logged (tail sampling: path matches /api/test/critical/**)',
  }
})
