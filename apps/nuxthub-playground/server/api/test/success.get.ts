export default defineEventHandler(async (event) => {
  const logger = useLogger(event)
  logger.set({ action: 'test-success', user: { id: 'user-1', plan: 'pro' } })

  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 50))

  logger.set({ result: 'ok', itemsProcessed: 42 })

  return { status: 'ok', message: 'Success route completed' }
})
