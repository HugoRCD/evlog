import { runTask } from 'nitropack/runtime'
import { eventHandler } from 'h3'

export default eventHandler(async () => {
  const result = await runTask('evlog:cleanup')
  return { success: true, ...result }
})
