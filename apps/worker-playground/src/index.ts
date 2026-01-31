import { initLogger, createRequestLogger } from 'evlog'

initLogger()

export default {
  fetch(request: Request): Response {
    const log = createRequestLogger({
      method: request.method,
      path: new URL(request.url).pathname,
      requestId: request.headers.get('CF-Request-ID') || undefined,
    })

    log.set({ customField: 'customValue' })

    log.emit()
    return new Response('Hello World!')
  }
}
