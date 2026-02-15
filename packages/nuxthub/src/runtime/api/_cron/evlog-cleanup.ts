import { runTask } from 'nitropack/runtime'
import { eventHandler, getHeader, createError } from 'h3'

export default eventHandler(async (event) => {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authorization = getHeader(event, 'authorization')
    if (authorization !== `Bearer ${cronSecret}`) {
      throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }
  }

  const result = await runTask('evlog:cleanup')
  return { success: true, ...result }
})
