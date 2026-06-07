const encoder = new TextEncoder()

/** ReadableStream that stays open until {@link createDeferredStream.close} is called. */
export function createDeferredStream() {
  let close: (() => void) | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('hello'))
      close = () => {
        controller.enqueue(encoder.encode(' world'))
        controller.close()
      }
    },
  })
  return {
    stream,
    close: () => {
      if (!close) throw new Error('close not initialized')
      close()
    },
  }
}
