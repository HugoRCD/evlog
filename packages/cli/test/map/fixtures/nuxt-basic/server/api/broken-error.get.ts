export default defineEventHandler(async () => {
  throw createError({
    message: 'Bad request',
    status: 400,
    why: 'Missing field',
  })
})
