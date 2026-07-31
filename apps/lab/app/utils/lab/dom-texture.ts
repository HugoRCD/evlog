/**
 * Turns a live DOM subtree into an image, frame by frame.
 *
 * The route is `<svg><foreignObject>` → `data:` URL → `<img>`. An SVG rendered
 * as an image is a sealed document: it cannot fetch anything. So every external
 * resource the stage depends on — stylesheets, web fonts, images, canvases —
 * has to be inlined before serialization.
 *
 * The expensive half of that (reading every stylesheet, base64-ing every font)
 * is done once and cached. Per frame only the subtree is re-serialized, which
 * is what keeps this viable as an animation capture rather than a screenshot
 * tool.
 */

/**
 * A frame of the stage, in the only form worth keeping.
 *
 * Two strings rather than a rasterized picture: a plate is megabytes as pixels
 * and tens of kilobytes as markup, which is the difference between holding a few
 * frames and holding a whole take. Rasterizing one back is a decode, with no
 * remount and no replay behind it.
 */
export interface PlateMarkup {
  head: string
  body: string
}

export interface DomTexture {
  /**
   * Rasterize the current state of the element.
   *
   * `scale` is supersampling: the SVG lays out at `width`×`height` CSS pixels
   * and rasterizes at `scale`× that, so the plate carries more detail than the
   * frame needs and survives being magnified by the camera.
   *
   * `image` is null when the markup is byte-for-byte what the last capture
   * produced — the caller already has that texture uploaded. `markup` is
   * returned either way, so a frame can be remembered even when nothing moved.
   */
  capture: (element: HTMLElement, width: number, height: number, scale: number) => Promise<{ image: HTMLImageElement | null, markup: PlateMarkup }>
  /** Rebuild a picture from markup kept earlier. */
  rasterize: (markup: PlateMarkup) => Promise<HTMLImageElement>
  /** Drop the cached stylesheet and font payload — call after a hot reload. */
  invalidate: () => void
  dispose: () => void
}

const FONT_MIME: Record<string, string> = {
  woff2: 'font/woff2',
  woff: 'font/woff',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

/** Cap the inlined font payload; a runaway family would stall every frame. */
const MAX_FONT_BYTES = 6 * 1024 * 1024

/**
 * The image has to be a `data:` URL, not a `blob:` one.
 *
 * Chrome treats an SVG image containing a `<foreignObject>` as not origin-clean
 * when it is loaded from a blob URL — every downstream read then throws, from
 * `texImage2D` to `getImageData` to `toDataURL`. The identical bytes served as a
 * `data:` URL are clean. Verified on Chrome 145 across headless, SwiftShader and
 * real-GPU runs; it is the URL scheme that decides, not the content.
 */
const DATA_PREFIX = 'data:image/svg+xml;charset=utf-8,'

/**
 * Wrap the stylesheet in a CDATA section.
 *
 * The SVG is parsed as XML, where a bare `&` or `<` in CSS is a fatal parse
 * error rather than something to recover from. CDATA suspends that — the only
 * sequence that still has to be neutralised is the terminator itself.
 */
function styleElement(css: string): string {
  return `<style><![CDATA[${css.replace(/]]>/g, ']]&gt;')}]]></style>`
}

async function fetchAsDataUrl(url: string, mime?: string): Promise<string | null> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) return null
    const blob = await response.blob()
    if (blob.size > MAX_FONT_BYTES) return null
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result)
        // FileReader infers the MIME from the response, which is often
        // `application/octet-stream` for fonts served by a dev server.
        resolve(mime ? result.replace(/^data:[^;]*/, `data:${mime}`) : result)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * Read every stylesheet in the document into one string.
 *
 * `cssRules` throws on cross-origin sheets, so those are re-fetched by href —
 * and skipped entirely if that fails too, since a missing third-party sheet is
 * better than no capture at all.
 */
async function collectCss(): Promise<string> {
  const chunks: string[] = []

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules
      let text = ''
      for (const rule of Array.from(rules)) text += `${rule.cssText}\n`
      chunks.push(text)
    } catch {
      if (!sheet.href) continue
      try {
        const response = await fetch(sheet.href, { credentials: 'same-origin' })
        if (response.ok) chunks.push(await response.text())
      } catch {
        // Unreadable and unfetchable — nothing left to try.
      }
    }
  }

  return chunks.join('\n')
}

/** Replace every `url(...)` inside `@font-face` blocks with a data URI. */
async function inlineFonts(css: string): Promise<string> {
  const seen = new Map<string, string | null>()
  const faces = css.match(/@font-face\s*\{[^}]*\}/g)
  if (!faces) return css

  const urls = new Set<string>()
  for (const face of faces) {
    for (const match of face.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
      const [, , url] = match
      if (url && !url.startsWith('data:')) urls.add(url)
    }
  }

  await Promise.all(
    Array.from(urls).map(async (url) => {
      const absolute = new URL(url, document.baseURI)
      // A cross-origin font cannot be read into a data URI; the capture falls
      // back to whatever the family's next fallback is.
      if (absolute.origin !== location.origin) {
        seen.set(url, null)
        return
      }
      const extension = absolute.pathname.split('.').pop()?.toLowerCase() ?? ''
      seen.set(url, await fetchAsDataUrl(absolute.href, FONT_MIME[extension]))
    }),
  )

  return css.replace(/@font-face\s*\{[^}]*\}/g, face =>
    face.replace(/url\((['"]?)([^'")]+)\1\)/g, (original, _quote, url: string) => {
      const inlined = seen.get(url)
      return inlined ? `url("${inlined}")` : original
    }))
}

/**
 * Copy the document's custom properties onto the capture wrapper.
 *
 * Design tokens are declared on `:root`, but inside the foreignObject the root
 * is the `<svg>` — so `:root` rules never match the cloned subtree and every
 * `var(--ui-bg)` resolves to nothing. Snapshotting the computed values onto the
 * wrapper puts them back in scope.
 */
function collectCustomProperties(): string {
  const declarations: string[] = []
  for (const element of [document.documentElement, document.body]) {
    const computed = getComputedStyle(element)
    for (const name of Array.from(computed)) {
      if (!name.startsWith('--')) continue
      const value = computed.getPropertyValue(name)
      if (value) declarations.push(`${name}:${value}`)
    }
  }
  return declarations.join(';')
}

/** `strokeDashoffset` → `stroke-dashoffset`, keeping vendor prefixes intact. */
function toKebab(property: string): string {
  const kebab = property.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
  return /^(webkit|moz|ms|o)-/.test(kebab) ? `-${kebab}` : kebab
}

/**
 * Freeze in-flight animations at their current value.
 *
 * A clone carries the *target* of an animation, not its current frame. Vue sets
 * a bar's width to its final value and lets a CSS transition interpolate; the
 * cloned node reports that final width, so every captured frame shows the bar
 * already full and the animation reads as broken. Text driven by JS state has no
 * such problem — the DOM really does change — which is why a counter animates
 * and a bar does not.
 *
 * Computed style, unlike the clone, reflects where the interpolation actually
 * is. Only properties some animation is currently touching get copied, so this
 * stays a handful of declarations per frame rather than a full style dump.
 */
function bakeAnimatedStyles(source: HTMLElement, clone: HTMLElement) {
  const animations = source.getAnimations({ subtree: true })
  if (!animations.length) return

  const properties = new Map<Element, Set<string>>()
  for (const animation of animations) {
    const { effect } = animation
    if (!(effect instanceof KeyframeEffect)) continue
    const { target, pseudoElement } = effect
    // A pseudo-element has no node in the clone to carry an inline style.
    if (!target || pseudoElement) continue

    const set = properties.get(target) ?? new Set<string>()
    for (const frame of effect.getKeyframes()) {
      for (const key of Object.keys(frame)) {
        if (key === 'offset' || key === 'computedOffset' || key === 'easing' || key === 'composite') continue
        set.add(toKebab(key))
      }
    }
    properties.set(target, set)
  }
  if (!properties.size) return

  // `cloneNode(true)` preserves document order, so the two flat lists line up
  // index for index. This runs before any node substitution, which would break
  // that correspondence.
  const sourceNodes = [source, ...Array.from(source.querySelectorAll('*'))]
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll('*'))]

  sourceNodes.forEach((node, index) => {
    const animated = properties.get(node)
    const target = cloneNodes[index]
    if (!animated || !(target instanceof HTMLElement || target instanceof SVGElement)) return
    const computed = getComputedStyle(node)
    for (const property of animated) {
      const value = computed.getPropertyValue(property)
      if (value) target.style.setProperty(property, value)
    }
  })
}

/**
 * Swap non-serializable nodes in the clone for static equivalents.
 *
 * A `<canvas>` carries its pixels in a context, not in markup, so a clone comes
 * out blank — its current contents have to be baked into an `<img>`. Same for
 * images pointing at URLs the sealed SVG will not be allowed to fetch.
 */
async function inlineNodes(source: HTMLElement, clone: HTMLElement, imageCache: Map<string, string | null>) {
  const sourceCanvases = Array.from(source.querySelectorAll('canvas'))
  const cloneCanvases = Array.from(clone.querySelectorAll('canvas'))
  cloneCanvases.forEach((canvasClone, index) => {
    const original = sourceCanvases[index]
    if (!original) return
    const replacement = document.createElement('img')
    try {
      replacement.src = original.toDataURL()
    } catch {
      // Tainted canvas — leave a transparent hole rather than failing the frame.
      return
    }
    replacement.setAttribute('style', canvasClone.getAttribute('style') ?? '')
    replacement.style.width = `${original.clientWidth || original.width}px`
    replacement.style.height = `${original.clientHeight || original.height}px`
    canvasClone.replaceWith(replacement)
  })

  const images = Array.from(clone.querySelectorAll('img'))
  await Promise.all(images.map(async (image) => {
    const src = image.getAttribute('src')
    if (!src || src.startsWith('data:')) return
    if (!imageCache.has(src)) {
      const absolute = new URL(src, document.baseURI)
      imageCache.set(src, absolute.origin === location.origin ? await fetchAsDataUrl(absolute.href) : null)
    }
    const inlined = imageCache.get(src)
    if (inlined) image.setAttribute('src', inlined)
    else image.removeAttribute('src')
  }))
}

/**
 * The stylesheet payload, shared by every stage.
 *
 * Reading each sheet and base64-ing every font is the expensive half of a
 * capture and the result is identical for all of them, so it is resolved once
 * for the document rather than once per staged component.
 */
let stylePayload: Promise<string> | null = null
let encodedStyle: string | null = null
const imageCache = new Map<string, string | null>()

function styles(): Promise<string> {
  stylePayload ??= collectCss().then(inlineFonts)
  return stylePayload
}

export function invalidateStyles() {
  stylePayload = null
  encodedStyle = null
  imageCache.clear()
}

export function createDomTexture(): DomTexture {
  let lastMarkup = ''
  let disposed = false

  async function capture(element: HTMLElement, width: number, height: number, scale: number): Promise<HTMLImageElement | null> {
    const css = await styles()
    if (disposed) throw new Error('DOM texture was disposed mid-capture.')

    const clone = element.cloneNode(true) as HTMLElement
    bakeAnimatedStyles(element, clone)
    await inlineNodes(element, clone, imageCache)

    // Class names from <html> and <body> carry the colour scheme (`.dark`) and
    // any font classes, which class-based rules in the payload need to match.
    const hostClasses = `${document.documentElement.className} ${document.body.className}`.trim()
    const bodyStyle = getComputedStyle(document.body)

    const wrapper = document.createElement('div')
    wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
    wrapper.setAttribute('class', hostClasses)
    wrapper.setAttribute(
      'style',
      [
        collectCustomProperties(),
        `width:${width}px`,
        `height:${height}px`,
        `font-family:${bodyStyle.fontFamily}`,
        `color:${bodyStyle.color}`,
        'background:transparent',
      ].join(';'),
    )
    wrapper.appendChild(clone)

    const serialized = new XMLSerializer().serializeToString(wrapper)
    const pixelWidth = Math.round(width * scale)
    const pixelHeight = Math.round(height * scale)

    // The `<foreignObject>` is laid out in CSS pixels while the SVG rasterizes
    // at `scale`×, so the viewBox does the upscaling — layout stays identical
    // and only the rasterization gets denser.
    const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${width} ${height}">`
    const body = `<foreignObject x="0" y="0" width="${width}" height="${height}">${serialized}</foreignObject></svg>`

    // These demos spend a good part of their timeline holding a state. When the
    // markup has not moved, the rasterized plate cannot have either — so skip
    // the decode, the upload and the mipmap generation entirely. That is most of
    // the per-frame cost, and it is pure waste on a frame that is identical.
    const markup: PlateMarkup = { head, body }
    const signature = head + body
    if (signature === lastMarkup) return { image: null, markup }
    lastMarkup = signature

    // `encodeURIComponent` maps each character independently, so encoding the
    // parts separately and joining them is identical to encoding the whole —
    // which lets the stylesheet, by far the largest and the only constant part,
    // be encoded once instead of on every frame.
    encodedStyle ??= encodeURIComponent(styleElement(css))

    return { image: await toImage(markup, pixelWidth, pixelHeight), markup }
  }

  async function toImage(markup: PlateMarkup, pixelWidth: number, pixelHeight: number): Promise<HTMLImageElement> {
    const image = new Image()
    image.decoding = 'sync'
    image.width = pixelWidth
    image.height = pixelHeight
    image.src = DATA_PREFIX + encodeURIComponent(markup.head) + encodedStyle + encodeURIComponent(markup.body)
    await image.decode()
    return image
  }

  return {
    capture,

    async rasterize(markup: PlateMarkup) {
      // The stylesheet is shared and may not have been encoded yet in this
      // session — a cached frame can be asked for before any capture has run.
      encodedStyle ??= encodeURIComponent(styleElement(await styles()))
      const size = /width="(\d+)" height="(\d+)"/.exec(markup.head)
      return toImage(markup, Number(size?.[1] ?? 0), Number(size?.[2] ?? 0))
    },

    invalidate: () => {
      lastMarkup = ''
    },
    dispose: () => {
      disposed = true
    },
  }
}
