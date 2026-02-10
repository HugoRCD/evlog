export default defineEventHandler(() => {
  throw createError({
    status: 500,
    message: 'Something went wrong',
    data: {
      code: 'VALIDATION_ERROR',
      why: 'The input format was invalid',
      fix: 'Ensure the input matches the expected schema',
    },
  })
})
