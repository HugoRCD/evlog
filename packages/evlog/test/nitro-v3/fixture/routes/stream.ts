import { defineHandler } from 'nitro/h3'
import { useLogger } from 'evlog'

export default defineHandler((event) => {
  const log = useLogger(event)

  log.set({ stream: { kind: 'sse' } })

  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: one\n\n'))
      controller.enqueue(encoder.encode('data: two\n\n'))
      controller.close()
    },
  })

  return new Response(body, {
    headers: { 'content-type': 'text/event-stream' },
  })
})
