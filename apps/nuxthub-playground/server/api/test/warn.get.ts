export default defineEventHandler(async (event) => {
  const logger = useLogger(event)
  logger.set({ action: 'test-warn', deprecation: 'v1-endpoint' })

  // Simulate a slow request
  await new Promise(resolve => setTimeout(resolve, 200))

  return { status: 'ok', message: 'Warn route completed (slow)' }
})
