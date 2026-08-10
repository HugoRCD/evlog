/**
 * Rasterizing a layer into something the renderer can draw.
 *
 * Layers used to live in the stage DOM and ride along with the component's
 * capture. That had two costs. It pinned every layer to the component's plane,
 * so an added image shared its tilt and its focus whether that was wanted or
 * not. And because a fade is an opacity written into the serialized markup, it
 * invalidated the unchanged-markup check on every single frame — measured at
 * 41ms per capture against 1ms without a layer, almost all of it Chrome
 * re-parsing the stylesheet to move one number.
 *
 * Drawn here instead, a layer is its own image. Opacity, placement and depth
 * became uniforms, so fading or moving one costs a draw call and nothing else.
 */

import { resolveSrc } from './assets'
import { layerFontFamily } from './layers'
import type { Layer } from './layers'

export interface LayerBitmap {
  source: TexImageSource
  /** Aspect of the rasterized art, so the plane can be sized to match. */
  aspect: number
}

/** Extra pixels either side of the text, so a glow or an italic never clips. */
const TEXT_PADDING = 0.25

/**
 * Draw a text layer.
 *
 * The families are the ones the app already loads, referenced through the same
 * CSS variables the docs theme defines — so a title is set in the site's own
 * type rather than in a lookalike.
 */
function drawText(layer: Layer, stage: { width: number, height: number }, scale: number): LayerBitmap | null {
  const raw = layer.text ?? ''
  if (!raw.trim()) return null
  const text = layer.uppercase ? raw.toUpperCase() : raw

  const fontSize = Math.max(1, (layer.fontSize ?? 0.12) * stage.height * scale)
  const boxWidth = Math.max(1, layer.width * stage.width * scale)
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue(layerFontFamily(layer).replace(/^var\((--[^,)]+).*$/, '$1').trim())
    .trim() || 'monospace'
  const font = `${layer.italic ? 'italic ' : ''}${layer.weight ?? 500} ${fontSize}px ${family}`
  // Chrome takes tracking on the context; ems rather than pixels so it survives
  // a change of size, which is how tracking is specified everywhere else.
  const tracking = `${(layer.letterSpacing ?? 0) * fontSize}px`

  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) return null
  measure.font = font
  measure.letterSpacing = tracking

  /*
   * Either the box constrains the type, or the type decides the box.
   *
   * Wrapping is only right for a column of prose. On a caption it produced a
   * texture far wider than the words in it — the selection box stretched off
   * past the type it belonged to — and dragging a corner narrowed the column
   * until the line broke, which reads as the text being cut rather than sized.
   */
  const hugs = (layer.textFit ?? 'auto') === 'auto'
  const lines: string[] = []

  if (hugs) {
    // Only where the author put a break. Nothing else may split a line.
    lines.push(...text.split('\n'))
  } else {
    for (const paragraph of text.split('\n')) {
      let line = ''
      for (const word of paragraph.split(' ')) {
        const candidate = line ? `${line} ${word}` : word
        if (measure.measureText(candidate).width > boxWidth && line) {
          lines.push(line)
          line = word
        } else {
          line = candidate
        }
      }
      lines.push(line)
    }
  }

  const contentWidth = hugs
    ? Math.max(1, ...lines.map(line => measure.measureText(line).width))
    : boxWidth

  const lineHeight = fontSize * (layer.lineHeight ?? 1.15)
  const glow = Math.max(0, layer.glow ?? 0)
  const stroke = Math.max(0, layer.stroke ?? 0)
  // The padding has to cover whatever is drawn outside the glyphs, or a halo
  // gets a square edge where the texture stops.
  const decoration = layer.decoration ?? 'none'
  const shadow = Math.max(0, layer.shadow ?? 0)
  const shadowX = (layer.shadowX ?? 0) * fontSize
  const shadowY = (layer.shadowY ?? 0) * fontSize
  // The cast shadow reaches further than the glyphs by its blur plus its offset,
  // and anything the texture does not make room for is cut off square.
  const shadowReach = shadow > 0
    ? shadow * 1.2 + Math.max(Math.abs(layer.shadowX ?? 0), Math.abs(layer.shadowY ?? 0))
    : 0
  const padding = fontSize * (TEXT_PADDING + glow * 0.75 + stroke * 0.5 + shadowReach)

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(contentWidth + padding * 2)
  canvas.height = Math.ceil(lines.length * lineHeight + padding * 2)

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const colour = layer.color ?? '#ffffff'
  ctx.font = font
  ctx.letterSpacing = tracking
  ctx.fillStyle = colour
  ctx.textBaseline = 'middle'
  ctx.textAlign = layer.align ?? 'center'

  const anchor = layer.align === 'left'
    ? padding
    : layer.align === 'right' ? canvas.width - padding : canvas.width / 2

  lines.forEach((line, index) => {
    const y = padding + lineHeight * (index + 0.5)

    /*
     * The cast shadow before anything else, so every later pass lands on top.
     *
     * One call rather than the glow's three: a shadow is a single soft copy
     * offset from the type, and stacking passes would darken it towards opaque
     * instead of softening it.
     */
    if (shadow > 0) {
      ctx.shadowColor = layer.shadowColor ?? '#000000cc'
      ctx.shadowBlur = shadow * fontSize
      ctx.shadowOffsetX = shadowX
      ctx.shadowOffsetY = shadowY
      ctx.fillText(line, anchor, y)
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
      ctx.shadowColor = 'transparent'
    }

    // The halo first, as its own passes. Canvas shadows are drawn per call, so
    // repeating a faint one builds a soft falloff where a single wide blur is
    // flat and looks printed on.
    if (glow > 0) {
      ctx.shadowColor = colour
      for (const spread of [0.4, 0.8, 1.4]) {
        ctx.shadowBlur = glow * fontSize * spread
        ctx.fillText(line, anchor, y)
      }
      ctx.shadowBlur = 0
      ctx.shadowColor = 'transparent'
    }

    if (stroke > 0) {
      ctx.lineWidth = stroke * fontSize
      ctx.strokeStyle = layer.strokeColor ?? '#000000'
      // Rounded joins: a mitre on a thick outline grows spikes off every sharp
      // corner of the type.
      ctx.lineJoin = 'round'
      ctx.miterLimit = 2
      ctx.strokeText(line, anchor, y)
    }

    ctx.fillText(line, anchor, y)

    /*
     * The rule, drawn rather than declared.
     *
     * Canvas has no text decoration, so it is a rectangle sized from the line's
     * own measurement — which is also the only way to get it right under
     * tracking, where the drawn width is not the sum of the glyph advances.
     *
     * The offsets come from the font's metrics rather than from a fraction of
     * the size: an underline placed at a fixed ratio sits through the
     * descenders of one face and below the box of another.
     */
    if (decoration !== 'none') {
      const metrics = ctx.measureText(line)
      const { width } = metrics
      const left = layer.align === 'left'
        ? anchor
        : layer.align === 'right' ? anchor - width : anchor - width / 2
      const thickness = Math.max(1, fontSize * 0.06)
      const offset = decoration === 'underline'
        ? (metrics.actualBoundingBoxDescent || fontSize * 0.2) * 0.6
        : -(metrics.actualBoundingBoxAscent || fontSize * 0.7) * 0.32
      ctx.fillRect(left, y + offset, width, thickness)
    }
  })

  return { source: canvas, aspect: canvas.width / canvas.height }
}

/**
 * Video sources, kept alive between frames.
 *
 * A video is the one layer whose picture depends on the playhead, so unlike a
 * title or a still it has to be re-uploaded as time moves. Recreating the
 * element each frame would restart the decode every time.
 */
const videoCache = new Map<string, HTMLVideoElement>()

export async function getVideo(src: string): Promise<HTMLVideoElement | null> {
  const cached = videoCache.get(src)
  if (cached) return cached
  try {
    // Cached under what the layer carries, built from what that resolves to. An
    // asset reference becomes an object URL over the stored blob, which is also
    // the source a decoder seeks through best — a data URL had to be parsed in
    // full before it could answer for a frame in the middle.
    const resolved = await resolveSrc(src)
    if (!resolved) return null
    const video = document.createElement('video')
    video.src = resolved
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('decode failed'))
    })
    videoCache.set(src, video)
    return video
  } catch {
    return null
  }
}

/**
 * Put a video on a given frame.
 *
 * `exact` waits for the seek to land, which is what an export and a scrub need:
 * the frame has to be the one at that instant, not whichever the decoder
 * happened to have ready. Live playback skips the wait and tolerates being a
 * frame or two off, because waiting on every seek would stall the loop.
 */
export async function seekVideo(video: HTMLVideoElement, seconds: number, exact: boolean): Promise<void> {
  const target = Math.max(0, Math.min(seconds, Math.max(0, video.duration - 0.001)))
  if (!Number.isFinite(target)) return

  if (!exact) {
    // A quarter second of drift is invisible at playback speed and costs nothing.
    if (Math.abs(video.currentTime - target) > 0.25) video.currentTime = target
    return
  }

  if (Math.abs(video.currentTime - target) < 0.001) return
  await new Promise<void>((resolve) => {
    const done = () => {
      video.removeEventListener('seeked', done)
      resolve()
    }
    video.addEventListener('seeked', done)
    video.currentTime = target
    // Never hang the render loop on a decoder that will not report back.
    setTimeout(done, 400)
  })
}

const imageCache = new Map<string, HTMLImageElement>()

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(src)
  if (cached) return cached
  try {
    const resolved = await resolveSrc(src)
    if (!resolved) return null
    const image = new Image()
    image.src = resolved
    await image.decode()
    imageCache.set(src, image)
    return image
  } catch {
    // A corrupt or unsupported file; the layer simply does not draw.
    return null
  }
}

export async function rasterizeLayer(
  layer: Layer,
  stage: { width: number, height: number },
  scale: number,
): Promise<LayerBitmap | null> {
  if (layer.kind === 'video') {
    if (!layer.src) return null
    const video = await getVideo(layer.src)
    if (!video?.videoWidth) return null
    return { source: video, aspect: video.videoWidth / video.videoHeight }
  }
  if (layer.kind === 'image') {
    if (!layer.src) return null
    const image = await loadImage(layer.src)
    if (!image?.naturalWidth) return null
    return { source: image, aspect: image.naturalWidth / image.naturalHeight }
  }
  return drawText(layer, stage, scale)
}
