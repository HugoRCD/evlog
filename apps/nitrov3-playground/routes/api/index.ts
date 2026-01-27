import { useLogger } from 'evlog'
import { defineHandler } from 'nitro/h3'

export default defineHandler((event) => {
  const log = useLogger(event)
  log.set({
    playground: 'nitrov3',
  })
  return {
    message: 'evlog Nitro v3 Playground',
    endpoints: [
      'GET /api/test/success',
      'POST /api/test/create',
      'PUT /api/test/update (always fails)',
      'DELETE /api/test/delete',
      'GET /api/test/wide-event',
    ],
  }
})
