export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  log.set({ item: 'test' })
  throw createError({
    message: 'Not found',
    status: 404,
    why: 'Resource does not exist',
    fix: 'Check the ID and try again',
  })
})
