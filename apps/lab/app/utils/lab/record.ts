/**
 * Frame-by-frame video export.
 *
 * The loop is deliberately not real time: render a frame, hand it to the
 * encoder with an explicit timestamp, repeat. Wall-clock cost per frame is
 * irrelevant to the result, so a 60fps export stays 60fps even when a single
 * frame needs a full second of DOM serialization and a 64-tap bokeh.
 */

import { Mp4Muxer } from './mp4'
import { WebmMuxer } from './webm'

export type Container = 'webm' | 'mp4'

/**
 * Codec candidates per container, best first.
 *
 * The H.264 list walks down through profile levels rather than naming one:
 * a level that covers 4K is rejected outright by some encoders at 720p, and a
 * 720p-class level cannot encode 4K, so the only reliable approach is to ask.
 */
const CANDIDATES: Record<Container, { codec: string, matroska?: string }[]> = {
  webm: [
    { codec: 'vp09.00.10.08', matroska: 'V_VP9' },
    { codec: 'vp8', matroska: 'V_VP8' },
  ],
  mp4: [
    { codec: 'avc1.640034' },
    { codec: 'avc1.640033' },
    { codec: 'avc1.640032' },
    { codec: 'avc1.640028' },
    { codec: 'avc1.4d0028' },
    { codec: 'avc1.42e01f' },
  ],
}

export interface EncodeOptions {
  canvas: HTMLCanvasElement
  container: Container
  fps: number
  frameCount: number
  /** Target bitrate in bits per second. */
  bitrate?: number
  /** Draw frame `index` onto the canvas. Awaited before the frame is encoded. */
  renderFrame: (index: number) => Promise<void>
  onProgress?: (rendered: number, total: number) => void
  signal?: AbortSignal
}

export function isEncodingSupported(): boolean {
  return typeof window !== 'undefined' && 'VideoEncoder' in window
}

interface CodecProbe {
  width: number
  height: number
  framerate: number
  bitrate: number
}

async function pickCodec(container: Container, probe: CodecProbe) {
  for (const candidate of CANDIDATES[container]) {
    try {
      const support = await VideoEncoder.isConfigSupported({ codec: candidate.codec, ...probe })
      if (support.supported) return candidate
    } catch {
      // An unparseable codec string throws rather than reporting unsupported.
    }
  }
  return null
}

export async function encodeVideo(options: EncodeOptions): Promise<Blob> {
  const { canvas, container, fps, frameCount, renderFrame, onProgress, signal } = options
  if (!isEncodingSupported()) {
    throw new Error('This browser has no WebCodecs VideoEncoder. Chrome, Edge or Safari 16.4+ are needed to export video.')
  }

  const { width } = canvas
  const { height } = canvas
  // Encoders reject odd dimensions for chroma-subsampled formats.
  if (width % 2 || height % 2) {
    throw new Error(`Output size must be even; got ${width}×${height}.`)
  }

  const bitrate = options.bitrate ?? Math.round(width * height * fps * 0.12)
  const candidate = await pickCodec(container, { width, height, framerate: fps, bitrate })
  if (!candidate) {
    throw new Error(`No supported ${container === 'mp4' ? 'H.264' : 'VP8/VP9'} encoder for ${width}×${height} in this browser.`)
  }

  const mp4 = container === 'mp4' ? new Mp4Muxer() : null
  const webm = candidate.matroska ? new WebmMuxer({ width, height, codec: candidate.matroska }) : null
  let failure: Error | null = null

  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      try {
        if (mp4) mp4.addChunk(chunk, metadata, { width, height, fps })
        else webm?.addChunk(chunk)
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error(String(error))
      }
    },
    error: (error) => {
      failure ??= error instanceof Error ? error : new Error(String(error))
    },
  })

  encoder.configure({
    codec: candidate.codec,
    width,
    height,
    framerate: fps,
    bitrate,
    latencyMode: 'quality',
    // Length-prefixed NAL units, which is both what `avcC` describes and what
    // the MP4 sample tables assume. It is also the mode that reports the
    // decoder configuration the muxer needs.
    ...(container === 'mp4' ? { avc: { format: 'avc' as const } } : {}),
  })

  const frameDuration = 1_000_000 / fps
  // A keyframe every two seconds keeps the file scrubbable in an editor without
  // paying for one on every frame.
  const keyframeInterval = Math.max(1, Math.round(fps * 2))

  try {
    for (let index = 0; index < frameCount; index++) {
      if (signal?.aborted) throw new DOMException('Export cancelled.', 'AbortError')
      if (failure) throw failure

      await renderFrame(index)

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(index * frameDuration),
        duration: Math.round(frameDuration),
      })
      encoder.encode(frame, { keyFrame: index % keyframeInterval === 0 })
      frame.close()

      // Encoding runs on its own thread; letting the queue run away holds every
      // pending frame's pixels in memory at once.
      while (encoder.encodeQueueSize > 4 && !signal?.aborted) {
        await new Promise(resolve => setTimeout(resolve, 4))
      }

      onProgress?.(index + 1, frameCount)
    }

    await encoder.flush()
    if (failure) throw failure
    return mp4 ? mp4.finalize() : webm!.finalize()
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Revoking synchronously can cancel the download before the browser reads it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Canvas produced no image.'))),
      'image/png',
    )
  })
}

/** Filename stem for a take: component, look and timestamp, safe for a shell. */
export function takeName(component: string, extension: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const slug = component.replace(/[^\w-]/g, '') || 'frame'
  return `${slug}-${stamp}.${extension}`
}
