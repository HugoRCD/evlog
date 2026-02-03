import { initWorkersLogger, createWorkersLogger } from 'evlog/workers'

initWorkersLogger({
  env: { service: 'workers-example' },
})

export default {
  async fetch(request: Request) {
    const log = createWorkersLogger(request)

    try {
      log.set({ route: 'health' })
      const response = new Response('ok', { status: 200 })
      log.emit({ status: response.status })
      return response
    } catch (error) {
      log.error(error as Error)
      log.emit({ status: 500 })
      throw error
    }
  },
}
