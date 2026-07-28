<script setup lang="ts">
/**
 * The render lab.
 *
 * A live doc component is staged off to the side, serialized into a texture
 * every frame, and put through a small camera-and-lens pipeline: tilt, depth of
 * field, bloom, grade. The result can be exported as a WebM at any resolution.
 *
 * Its own app rather than a docs route: none of this ships to readers, and the
 * pipeline has nothing in common with a documentation site. The components it
 * films do still come from the docs app, which is the point — a release video
 * is shot from the real component, not from a copy that has drifted.
 */

import { createClock } from '~/utils/lab/clock'
import { createDomTexture, invalidateStyles } from '~/utils/lab/dom-texture'
import { LabRenderer } from '~/utils/lab/renderer'
import { canvasToBlob, download, encodeVideo, isEncodingSupported, takeName } from '~/utils/lab/record'
import type { Container } from '~/utils/lab/record'
import { DEFAULT_COMPONENT, resolveEntry } from '~/utils/lab/registry'
import { DEFAULT_SETTINGS, applyPreset, frameCountFor, frameStep, outputDuration } from '~/utils/lab/settings'
import { MAX_SHARE_URL, resolveInitialDocument, saveStored, shareUrl } from '~/utils/lab/storage'
import {
  cloneLayer,
  constrainToTimeline,
  createComponentLayer,
  createMediaLayer,
  isTimeVarying,
  createTextLayer,
  layerDepth,
  layerStateAt,
  layerTextureKey, layerEnd 
} from '~/utils/lab/layers'
import type { Layer } from '~/utils/lab/layers'
import { evaluateEffects } from '~/utils/lab/effects'
import { getVideo, rasterizeLayer, seekVideo } from '~/utils/lab/layer-textures'
import type { LayerPlane, OverlayQuad } from '~/utils/lab/renderer'

useHead({
  title: 'evlog render lab',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const route = useRoute()
const router = useRouter()

// A link wins over the stored working copy; anything else resumes where the
// last session left off.
const initial = resolveInitialDocument(route.query)
const settings = ref(initial.settings)
const layers = ref<Layer[]>(initial.layers)
const selectedId = ref<string | null>(null)
/** Camera moves over the take. */
const camera = ref(initial.camera)
// A fresh session opens on a built-in animation rather than an empty frame:
// it is the fastest way to see what the lab does.
if (!layers.value.length) {
  layers.value = [createComponentLayer(DEFAULT_COMPONENT, 0, settings.value.timelineLength)]
  // Written straight away rather than waiting for the first edit, so a reload
  // resumes the same document instead of seeding a second one.
  saveStored(currentDocument())
}

// Having adopted the link, drop its query. The address bar then only ever holds
// a URL somebody deliberately produced, and never a running log of every slider
// that happened to be touched.
if (initial.fromLink) router.replace({ query: {} })

const showSource = ref(false)
const panelVisible = ref(true)
/** Armed by the crosshair button; the next click on the frame sets the focal plane. */
const picking = ref(false)

const canvas = useTemplateRef('canvas')
const stagesRoot = useTemplateRef('stagesRoot')

/** Bumped to remount every staged component, restarting their sequences at zero. */
const stageKey = ref(0)

const componentLayers = computed(() => layers.value.filter(layer => layer.kind === 'component'))
const stagedComponents = computed(() =>
  componentLayers.value.map(layer => ({ layer, component: resolveEntry(layer.component ?? '') })),
)

/** Position on the component's own timeline, in ms. */
const playhead = ref(0)
const playing = ref(true)
const seeking = ref(false)

const busy = ref(false)
const progress = ref(0)
const highPrecision = ref(true)
const captureMs = ref(0)
const error = ref('')

let renderer: LabRenderer | null = null
/** One serializer per staged component: each keeps its own unchanged-markup check. */
const stageTextures = new Map<string, ReturnType<typeof createDomTexture>>()
let clock: ReturnType<typeof createClock> | null = null
let rafHandle = 0
let observer: ResizeObserver | null = null
let capturing = false
let lastCaptureAt = 0
let lastFrameAt = 0
/** Component time owed to the clock but not yet worth a whole frame. */
let frameDebt = 0
let videoSyncing = false

/**
 * Preview resolution, matched to how large the canvas is actually drawn.
 *
 * A fixed backing size stretched to fill the viewport is the whole reason a
 * preview looks soft and blocky: the browser upscales it, and on a high-density
 * display that is a 2× or 3× magnification of an already-too-small buffer. So
 * the buffer follows the element's real size times the device pixel ratio.
 *
 * The ceiling exists because everything downstream is per-pixel: a 64-tap bokeh
 * over a 5K buffer would turn slider dragging into a slideshow. Beyond it the
 * preview goes back to being upscaled, which is the right trade at that size.
 */
const PREVIEW_MAX_PIXELS = 2560 * 1440
const displaySize = ref({ width: 0, height: 0 })

const previewSize = computed(() => {
  const { outputWidth, outputHeight } = settings.value
  const { width: cssWidth } = displaySize.value

  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  // Never exceed the export resolution — past it there is no more detail to show.
  let width = cssWidth > 0 ? Math.min(outputWidth, Math.round(cssWidth * dpr)) : outputWidth
  let height = Math.round((width * outputHeight) / outputWidth)

  const excess = (width * height) / PREVIEW_MAX_PIXELS
  if (excess > 1) {
    const shrink = Math.sqrt(excess)
    width = Math.round(width / shrink)
    height = Math.round(height / shrink)
  }

  return {
    // Even dimensions keep the preview consistent with what the encoder accepts.
    width: Math.max(2, Math.round(width / 2) * 2),
    height: Math.max(2, Math.round(height / 2) * 2),
  }
})

/**
 * The camera as it stands at the playhead.
 *
 * A travelling is the effect library pointed at the shot instead of a layer: a
 * dolly moves the camera along its own axis, a slide pans it, a spin rolls it,
 * and a fade takes the whole frame down to black through exposure. Same ramps,
 * same curves, same editor.
 */
const shotSettings = computed(() => {
  if (!camera.value.length) return settings.value
  const move = evaluateEffects(camera.value, playhead.value, settings.value.timelineLength)
  return {
    ...settings.value,
    // Depth reads as distance: still displaced means still pulled back, so the
    // move resolves into the framing rather than out of it.
    zoom: Math.max(0.05, (settings.value.zoom * move.scale) / (1 + move.depth)),
    panX: settings.value.panX + move.offsetX,
    panY: settings.value.panY + move.offsetY,
    roll: settings.value.roll + move.rotation,
    exposure: settings.value.exposure * move.opacity,
  }
})

/**
 * The timeline is as long as what is on it.
 *
 * Set by hand it could outlive every clip, and the playhead would sit past all
 * of them on a frame where nothing is in its span — a black frame, in the
 * preview and in the export alike.
 */
watch([layers, () => settings.value.tail], () => {
  const end = layers.value.reduce((longest, layer) => Math.max(longest, layerEnd(layer)), 0)
  settings.value.timelineLength = Math.max(1000, Math.round(end) + settings.value.tail)
}, { deep: true, immediate: true })

const stageAspect = computed(() => settings.value.stageWidth / settings.value.stageHeight)
function currentDocument() {
  return { settings: settings.value, layers: layers.value, camera: camera.value }
}

/** What a take is named after: the first thing in it that has a name. */
const takeSubject = computed(() => layers.value[0]?.name ?? 'lab')
const outputMs = computed(() => outputDuration(settings.value))
const frameCount = computed(() => frameCountFor(settings.value))

/**
 * Serialize every staged component into its texture.
 *
 * Each has its own serializer so its unchanged-markup check is its own: a title
 * card that is holding still must not be re-rasterized because a chart beside it
 * moved.
 */
async function captureStage(): Promise<void> {
  if (!renderer || !stagesRoot.value) return
  // The virtual clock owns `performance.now`, so timing has to come from the
  // real one — otherwise every capture measures as taking zero time.
  const started = Date.now()
  const { stageWidth, stageHeight, plateScale } = settings.value

  for (const layer of componentLayers.value) {
    const element = stagesRoot.value.querySelector<HTMLElement>(`[data-stage="${layer.id}"]`)
    if (!element) continue

    let serializer = stageTextures.get(layer.id)
    if (!serializer) {
      serializer = createDomTexture()
      stageTextures.set(layer.id, serializer)
    }

    const image = await serializer.capture(element, stageWidth, stageHeight, plateScale)
    if (!renderer) return
    // Null means the markup was unchanged and the uploaded texture still stands.
    if (image) renderer.setLayerTexture(layer.id, image)

    // Recorded on every pass, not only when a new picture arrives. A capture
    // that reports "unchanged" would otherwise never restore an aspect that
    // something else had dropped, and the plane would stay missing for good.
    setAspect(layer.id, stageAspect.value)
  }

  captureMs.value = Date.now() - started
}

/**
 * Step the clock to a point in component time.
 *
 * Forward is cheap — the clock only ever runs forward, so it is a matter of
 * advancing it. Backward is not: a sequence cannot be un-run, so the component
 * is remounted at zero and replayed. That is the same path the export takes, so
 * whatever the playhead shows is what will be rendered.
 */
async function runSeek(goal: number) {
  if (!clock) return

  if (goal < clock.now - 1) {
    clock.reset()
    invalidateStageMarkup()
    stageKey.value++
    await nextTick()
    // Most of these components start themselves from an IntersectionObserver,
    // which fires on a real task rather than on a frame.
    await realDelay(120)
  }

  advanceToTime(goal)

  // One settled frame at the end, so any transition the last step started is
  // registered before the plate is captured.
  await clock.advance(0)
  await captureStage().catch(() => {})
  await syncVideoFrames(goal, true)
}

/**
 * Run the clock up to `goal`, one output frame at a time.
 *
 * Stepping on the frame grid rather than by an arbitrary interval is what makes
 * a scrub land on the same state the export will render at that instant.
 */
function advanceToTime(goal: number) {
  if (!clock) return
  const step = frameStep(settings.value)
  let guard = 0
  while (clock.now < goal - 0.001 && guard++ < 20000) {
    clock.advanceSync(Math.min(step, goal - clock.now))
  }
}

/** Latest requested position while a seek is already running. */
let pendingSeek: number | null = null

async function seekTo(target: number) {
  const clamped = Math.max(0, Math.min(target, settings.value.timelineLength))
  playhead.value = clamped
  pendingSeek = clamped
  if (seeking.value) return

  seeking.value = true
  try {
    // Coalesce: a drag emits far more positions than a replay can service, and
    // only the most recent one is worth honouring.
    while (pendingSeek !== null) {
      const goal = pendingSeek
      pendingSeek = null
      await runSeek(goal)
    }
  } finally {
    seeking.value = false
  }
}

/** Live loop: re-serialize the DOM on a budget, but composite every frame. */
function tick(now: number) {
  rafHandle = clock?.raf(tick) ?? 0
  if (busy.value || !renderer) return

  // Step the staged component by the real elapsed time, scaled. The clock is
  // virtual even in preview, so `speed` is honoured on screen and not just in
  // the export — what you grade is what you get.
  //
  // The delta is clamped because a background tab or a long capture can leave a
  // gap of seconds, and replaying that in one step would skip the sequence.
  const delta = lastFrameAt ? Math.min(now - lastFrameAt, 100) : 0
  lastFrameAt = now

  if (playing.value && !seeking.value) {
    // Play on the frame grid too: the preview then shows the frames that will
    // be exported, not an interpolation between them.
    frameDebt += delta * settings.value.speed
    const step = frameStep(settings.value)
    let steps = 0
    while (frameDebt >= step && steps++ < 8) {
      clock?.advanceSync(step)
      frameDebt -= step
    }
    playhead.value = clock?.now ?? 0
    // Loop the trimmed segment rather than the whole timeline: while grading,
    // the part being watched is the part being exported.
    if (playhead.value >= settings.value.timelineLength) void seekTo(0)
  }

  if (hasVideoLayer.value && !videoSyncing) {
    videoSyncing = true
    void syncVideoFrames(playhead.value, false).finally(() => {
      videoSyncing = false
    })
  }

  // Grain and any future time-based effect stay smooth at display rate even
  // though the plate underneath refreshes more slowly.
  renderer.render(shotSettings.value, now, layerPlanes.value, overlayQuads.value)

  // Adaptive pacing. Serializing the stage is synchronous main-thread work, so
  // a fixed 30Hz schedule on a component that costs 80ms per capture leaves no
  // room for anything else and the whole UI stutters. Spacing captures by what
  // the last one actually cost keeps the compositor — and slider dragging —
  // responsive, at the price of a plate that refreshes less often.
  const interval = Math.min(250, Math.max(1000 / 30, captureMs.value * 1.6))
  if (!capturing && now - lastCaptureAt >= interval) {
    capturing = true
    lastCaptureAt = now
    captureStage()
      // Clear on success: a transient failure (a font still loading, a mid-swap
      // component) should not leave a banner up for the rest of the session.
      .then(() => {
        error.value = ''
      })
      .catch((cause) => {
        error.value = cause instanceof Error ? cause.message : String(cause)
      })
      .finally(() => {
        capturing = false
      })
  }
}

onMounted(async () => {
  if (!canvas.value) return
  try {
    renderer = new LabRenderer(canvas.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
    return
  }

  highPrecision.value = renderer.highPrecision
  renderer.setStageAspect(stageAspect.value)
  clock = createClock()
  // Virtual from the start: the preview is then the same function of time the
  // export is, so a shot cannot look different once rendered.
  clock.enterVirtual()

  // The canvas' CSS size comes from its container and aspect ratio, never from
  // its backing store, so observing it cannot feed back into itself.
  observer = new ResizeObserver(([entry]) => {
    const box = entry?.contentRect
    if (box) displaySize.value = { width: box.width, height: box.height }
  })
  observer.observe(canvas.value)

  renderer.resize(previewSize.value.width, previewSize.value.height)
  // First capture before the loop starts, so the first painted frame already
  // has the component in it rather than a black flash.
  await captureStage().catch(() => {})
  await syncLayerTextures()
  rafHandle = clock.raf(tick)
})

onBeforeUnmount(() => {
  clock?.cancelRaf(rafHandle)
  observer?.disconnect()
  clock?.dispose()
  for (const serializer of stageTextures.values()) serializer.dispose()
  stageTextures.clear()
  renderer?.dispose()
})

watch(previewSize, (size) => {
  if (!busy.value) renderer?.resize(size.width, size.height)
})

watch(stageAspect, aspect => renderer?.setStageAspect(aspect))

watch(() => componentLayers.value.map(layer => layer.component).join('|'), () => {
  stageKey.value++
  lastCaptureAt = 0
})

// Re-serializing after a size change picks up the new layout; without it the
// plate keeps the old aspect until the next scheduled capture.
watch([() => settings.value.stageWidth, () => settings.value.stageHeight], () => {
  lastCaptureAt = 0
})

// Persist the working copy. Debounced because dragging a control fires on every
// pointer move, and serialising on each one is wasted work.
let saveTimer: ReturnType<typeof setTimeout> | undefined
watch([settings, layers, camera], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const saved = saveStored(currentDocument())
    // Surfaced rather than logged: losing a project on the next reload is not
    // something to discover afterwards.
    if (!saved.ok) error.value = saved.reason
  }, 300)
}, { deep: true })
onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  // Flush, so a reload right after a change does not lose it.
  saveStored(currentDocument())
})

/** Restart the segment from its in point. */
/** Force every stage to re-serialize, after a remount reset their DOM. */
function invalidateStageMarkup() {
  for (const serializer of stageTextures.values()) serializer.invalidate()
}

function replay() {
  playing.value = true
  void seekTo(settings.value.trimIn)
}

function togglePlay() {
  playing.value = !playing.value
  // Resuming past the end would sit on a frame where every layer has finished,
  // which is simply black; drop back to the top instead.
  if (playing.value && playhead.value >= settings.value.timelineLength) void seekTo(0)
}

const selectedLayer = computed(() => layers.value.find(layer => layer.id === selectedId.value) ?? null)

/** Layers are placed against the stage, so their geometry needs its size. */
const stageBox = computed(() => ({ width: settings.value.stageWidth, height: settings.value.stageHeight }))

/**
 * Layer art, uploaded once per change rather than once per frame.
 *
 * The key covers everything the picture depends on — text, type, colour, size —
 * and deliberately excludes opacity, placement and depth, which are uniforms.
 * That is what makes a fade free: it moves a number, it does not redraw a title.
 */
const textureKeys = new Map<string, string>()
/** Aspect of each layer's art, so a plane can be sized to its content. */
const layerAspects = ref(new Map<string, number>())

/**
 * Write one entry, always against the current table.
 *
 * Batching these through a snapshot taken before an `await` loses whatever was
 * recorded in the meantime — and since a stage capture reports "unchanged" on
 * the following frame, a lost aspect never came back and the plane vanished.
 */
function setAspect(id: string, aspect: number) {
  if (layerAspects.value.get(id) === aspect) return
  layerAspects.value = new Map(layerAspects.value).set(id, aspect)
}

function dropAspect(id: string) {
  if (!layerAspects.value.has(id)) return
  const next = new Map(layerAspects.value)
  next.delete(id)
  layerAspects.value = next
}

async function syncLayerTextures() {
  if (!renderer) return
  const live = new Set(layers.value.map(layer => layer.id))

  for (const id of [...textureKeys.keys()]) {
    if (live.has(id)) continue
    renderer.dropLayerTexture(id)
    textureKeys.delete(id)
    dropAspect(id)
  }
  for (const id of [...stageTextures.keys()]) {
    if (live.has(id)) continue
    stageTextures.get(id)?.dispose()
    stageTextures.delete(id)
    renderer.dropLayerTexture(id)
    dropAspect(id)
  }

  for (const layer of layers.value) {
    // Component layers get their picture from the stage capture instead.
    if (layer.kind === 'component') continue
    const key = layerTextureKey(layer, stageBox.value, settings.value.plateScale)
    if (textureKeys.get(layer.id) === key) continue

    const bitmap = await rasterizeLayer(layer, stageBox.value, settings.value.plateScale)
    if (!renderer) return
    if (!bitmap) {
      // Empty text, or an image that would not decode: drop whatever was there
      // rather than leaving the previous picture behind.
      renderer.dropLayerTexture(layer.id)
      textureKeys.delete(layer.id)
      dropAspect(layer.id)
      continue
    }
    renderer.setLayerTexture(layer.id, bitmap.source)
    textureKeys.set(layer.id, key)
    setAspect(layer.id, bitmap.aspect)
  }
}

watch(
  [layers, () => settings.value.stageWidth, () => settings.value.stageHeight, () => settings.value.plateScale],
  () => void syncLayerTextures(),
  { deep: true },
)

/**
 * The layers currently in shot, resolved into planes.
 *
 * A layer outside its span contributes nothing, so it is dropped before it ever
 * reaches a draw call.
 */
/**
 * Overlay layers, in frame fractions.
 *
 * Their geometry is expressed against the output frame rather than the stage,
 * because that is what they sit on — an overlay does not belong to the staged
 * surface and must not move when the stage is resized.
 */
const overlayQuads = computed<OverlayQuad[]>(() => {
  const frameAspect = settings.value.outputWidth / settings.value.outputHeight
  return layers.value.flatMap((layer) => {
    if (layer.space !== 'overlay') return []
    const state = layerStateAt(layer, playhead.value)
    const aspect = layerAspects.value.get(layer.id)
    if (!state || !aspect) return []

    const halfWidth = (layer.width * state.scale) / 2
    return [
      {
        id: layer.id,
        // Effects displace in scene units; halved here to read the same on screen.
        x: layer.x + state.offsetX / 2,
        // Layer Y runs top-down, the frame runs bottom-up.
        y: 1 - layer.y + state.offsetY / 2,
        halfWidth,
        halfHeight: (halfWidth * frameAspect) / aspect,
        rotation: layer.rotation + state.rotation,
        opacity: state.opacity,
      }
    ]
  })
})

const layerPlanes = computed<LayerPlane[]>(() => {
  const stage = stageBox.value
  // The plate is two world units tall by definition, so a fraction of the stage
  // converts straight into world units against that.
  const planeWidthFor = (fraction: number) => fraction * (stage.width / stage.height)

  return layers.value.flatMap((layer) => {
    if (layer.space === 'overlay') return []
    const state = layerStateAt(layer, playhead.value)
    const aspect = layerAspects.value.get(layer.id)
    if (!state || !aspect) return []

    // Effects displace the layer from where it rests, so they add to its
    // authored placement rather than replacing it.
    const halfWidth = planeWidthFor(layer.width) * state.scale
    const halfHeight = layer.kind === 'component'
      // A staged component is the plate: its height is the scene's unit height,
      // so `width` scales it about that rather than deriving from a bitmap.
      ? (halfWidth / (stage.width / stage.height))
      : halfWidth / aspect
    return [
      {
        id: layer.id,
        depth: layerDepth(layer) + state.depth,
        // Stage fractions run top-down; the scene's Y axis runs up.
        offsetX: (layer.x - 0.5) * 2 * (stage.width / stage.height) + state.offsetX,
        offsetY: -(layer.y - 0.5) * 2 + state.offsetY,
        halfWidth,
        halfHeight: halfWidth / aspect,
        rotation: layer.rotation + state.rotation,
        opacity: state.opacity,
        emission: settings.value.emission,
      },
    ]
  })
})

function addLayer(layer: Layer) {
  const placed = constrainToTimeline(layer, settings.value.timelineLength)
  layers.value = [...layers.value, placed]
  selectedId.value = placed.id
}

/** New layers open at the playhead: where you are is where you are composing. */
function defaultSpan() {
  const start = Math.min(playhead.value, Math.max(0, settings.value.timelineLength - 1500))
  return { start, duration: Math.min(2000, settings.value.timelineLength - start) }
}

function addText() {
  const { start, duration } = defaultSpan()
  addLayer(createTextLayer(start, duration))
}

const fileInput = useTemplateRef('fileInput')

function addMedia() {
  fileInput.value?.click()
}

async function onImagePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  // Inlined rather than referenced: the capture seals the SVG, so anything the
  // stage points at has to already be in the document.
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.readAsDataURL(file)
  }).catch((cause: Error) => {
    error.value = cause.message
    return ''
  })
  if (!src) return

  const name = file.name.replace(/\.[^.]+$/, '')
  const { start } = defaultSpan()

  if (file.type.startsWith('video/')) {
    const video = await getVideo(src)
    if (!video) {
      error.value = `${file.name} could not be decoded. Chrome plays MP4/H.264 and WebM.`
      return
    }
    // A clip opens at its own length, clamped to the timeline: importing footage
    // and having it silently truncated to a default span is not useful.
    const length = Math.round(video.duration * 1000) || 2000
    addLayer(createMediaLayer({
      kind: 'video',
      start,
      duration: Math.min(length, settings.value.timelineLength - start),
      src,
      name,
    }))
    return
  }

  const { duration } = defaultSpan()
  addLayer(createMediaLayer({ kind: 'image', start, duration, src, name }))
}

/**
 * Put every video on the frame the playhead is on.
 *
 * Separate from the texture cache because a video is the one layer whose picture
 * is a function of time — the others are drawn once and then only moved.
 */
async function syncVideoFrames(time: number, exact: boolean) {
  if (!renderer) return
  for (const layer of layers.value) {
    if (!isTimeVarying(layer) || !layer.src) continue
    if (!layerStateAt(layer, time)) continue

    const video = await getVideo(layer.src)
    if (!video?.videoWidth || !renderer) continue
    await seekVideo(video, (time - layer.start + (layer.trim ?? 0)) / 1000, exact)
    renderer.setLayerTexture(layer.id, video)
  }
}

const hasVideoLayer = computed(() => layers.value.some(isTimeVarying))

function updateLayer(id: string, patch: Partial<Layer>) {
  layers.value = layers.value.map(layer => (layer.id === id ? { ...layer, ...patch } : layer))
}

function removeSelected() {
  if (!selectedId.value) return
  layers.value = layers.value.filter(layer => layer.id !== selectedId.value)
  selectedId.value = null
}

function duplicateSelected() {
  const layer = selectedLayer.value
  if (!layer) return
  // Offset by its own length so the copy sits after the original rather than
  // hiding underneath it.
  const copy = constrainToTimeline(
    { ...cloneLayer(layer), start: layer.start + layer.duration },
    settings.value.timelineLength,
  )
  layers.value = [...layers.value, copy]
  selectedId.value = copy.id
}

function splitLayer(id: string) {
  const layer = layers.value.find(entry => entry.id === id)
  if (!layer) return
  const at = playhead.value
  if (at <= layer.start + 100 || at >= layerEnd(layer) - 100) return

  // The tail keeps the exit effects and the head keeps the entrance, which is
  // what makes a split read as a cut rather than as two half-animated clips.
  const head: Layer = { ...layer, duration: at - layer.start, effects: layer.effects.filter(e => e.at === 'in') }
  const tail: Layer = {
    ...cloneLayer(layer, ''),
    start: at,
    duration: layerEnd(layer) - at,
    effects: layer.effects.filter(e => e.at === 'out'),
  }
  layers.value = layers.value.flatMap(entry => (entry.id === id ? [head, tail] : [entry]))
  selectedId.value = tail.id
}

function copyLayer(id: string) {
  const layer = layers.value.find(entry => entry.id === id)
  if (layer) clipboard = { ...layer }
}

/** An in-app clipboard: the system one cannot hold a layer. */
let clipboard: Layer | null = null

function copySelected() {
  if (selectedLayer.value) clipboard = { ...selectedLayer.value }
}

function pasteClipboard() {
  if (!clipboard) return
  // Pasted at the playhead, which is where a paste is aimed.
  const copy = constrainToTimeline(
    { ...cloneLayer(clipboard, ''), start: playhead.value },
    settings.value.timelineLength,
  )
  layers.value = [...layers.value, copy]
  selectedId.value = copy.id
}


/**
 * Set the focal plane from a click on the frame.
 *
 * The canvas is letterboxed inside its box by `object-fit`-style CSS, but its
 * element box matches the frame exactly (aspect-ratio plus max-width/height), so
 * the element's own rect is the frame and no letterbox correction is needed.
 */
function onFrameClick(event: MouseEvent) {
  if (!picking.value || !renderer) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (!rect.width || !rect.height) return

  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1
  // Clip space has y up; a pointer event has it down.
  const ndcY = 1 - ((event.clientY - rect.top) / rect.height) * 2

  const focus = renderer.focusAt(shotSettings.value, ndcX, ndcY)
  if (focus !== null) settings.value.focus = Number(focus.toFixed(3))
  picking.value = false
}

/**
 * Shrink the stage to the height the component actually occupies.
 *
 * Most of these demos are far shorter than the default stage, and the empty
 * plate below them is dead frame the camera still has to compose around.
 */
function fitStage() {
  const content = stage.value?.firstElementChild
  if (!content) return
  const height = Math.ceil(content.getBoundingClientRect().height)
  if (height > 0) settings.value.stageHeight = Math.min(1600, Math.max(240, height))
  lastCaptureAt = 0
}

/** Back to a square-on, edge-to-edge framing without touching the grade. */
function resetCamera() {
  Object.assign(settings.value, { pitch: 0, yaw: 0, roll: 0, zoom: 1, focus: 0.5, panX: 0, panY: 0 })
}

/**
 * Back to defaults, keeping the shot itself.
 *
 * The component and the layers are the project; everything else is how it is
 * being filmed. Wiping the lot would mean re-importing media to undo a bad
 * grade, so they survive.
 */
function resetSettings() {
  settings.value = { ...DEFAULT_SETTINGS }
  camera.value = []
  void seekTo(0)
}

function resetEverything() {
  layers.value = [createComponentLayer(DEFAULT_COMPONENT, 0, DEFAULT_SETTINGS.timelineLength)]
  selectedId.value = null
  camera.value = []
  settings.value = { ...DEFAULT_SETTINGS }
  void seekTo(0)
}

/** Add another built-in animation as a layer. */
function addComponent() {
  const { start, duration } = defaultSpan()
  addLayer(createComponentLayer(DEFAULT_COMPONENT, start, duration))
}

function onPreset(name: string) {
  settings.value = applyPreset(settings.value, name)
}

const linkCopied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyLink() {
  const url = shareUrl(currentDocument())
  if (url.length > MAX_SHARE_URL) {
    error.value = `This shot carries ${(url.length / 1024).toFixed(0)}KB of layer data — mostly inlined images — and the link would be truncated in transit. Remove the image layers to share it.`
    return
  }
  await navigator.clipboard.writeText(url)
  linkCopied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    linkCopied.value = false
  }, 1600)
}

/** Wait on a real timer — the clock only patches rAF, so this survives virtual mode. */
function realDelay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Restart the staged component with the clock already virtual.
 *
 * The remount has to happen after `enterVirtual`, so the frames the component
 * schedules on mount land in the virtual queue. The delay is for the
 * IntersectionObserver that most of these components use to start themselves —
 * it fires on a real task, not on a frame.
 */
async function primeVirtualStage() {
  // Everything the export depends on is imposed here rather than inherited.
  // A take must be a function of the timeline alone: whatever the playhead was
  // doing, whichever frame was on screen, the file has to come out the same.
  playing.value = false

  // A scrub in flight drives the same clock, and its remaining steps would
  // interleave with the export's own.
  let waited = 0
  while (seeking.value && waited < 3000) {
    await realDelay(20)
    waited += 20
  }

  clock?.enterVirtual()
  clock?.reset()
  playhead.value = 0
  invalidateStageMarkup()
  stageKey.value++
  await nextTick()

  // Most staged components start themselves from an IntersectionObserver, which
  // fires on a real task. Until every one of them has, the first frames would
  // capture whichever happened to be ready.
  await realDelay(300)

  // Two settled frames: the first lets each component start, the second lets
  // whatever that started register before anything is captured.
  await clock?.advance(0)
  await clock?.advance(0)
  await captureStage()
}

async function exportPng() {
  if (!renderer || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const { outputWidth, outputHeight } = settings.value
    renderer.resize(outputWidth, outputHeight)
    await captureStage()
    renderer.render(shotSettings.value, performance.now(), layerPlanes.value, overlayQuads.value)
    download(await canvasToBlob(renderer.canvas), takeName(takeSubject.value, 'png'))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    renderer.resize(previewSize.value.width, previewSize.value.height)
    busy.value = false
  }
}

let abort: AbortController | null = null

async function exportVideo() {
  if (!renderer || busy.value) return
  if (!isEncodingSupported()) {
    error.value = 'This browser cannot encode video. Chrome, Edge or Safari 16.4+ are needed.'
    return
  }

  busy.value = true
  progress.value = 0
  error.value = ''
  abort = new AbortController()

  const { fps, speed, container } = settings.value
  // Component milliseconds per output frame: a slower playback rate covers less
  // of the sequence per frame, which is what makes the export slow motion.
  const frameInterval = (1000 / fps) * speed
  const frameCount = frameCountFor(settings.value)

  try {
    await primeVirtualStage()
    renderer.resize(settings.value.outputWidth, settings.value.outputHeight)

    const blob = await encodeVideo({
      canvas: renderer.canvas,
      fps,
      frameCount,
      container: container as Container,
      signal: abort.signal,
      onProgress: (rendered, total) => {
        progress.value = rendered / total
      },
      renderFrame: async (index) => {
        // Frame 0 is the scene at t=0; every later frame is exactly one interval
        // on, regardless of how long the previous one took to build.
        await clock?.advance(index === 0 ? 0 : frameInterval)

        // The preview loop is stopped while exporting, so the playhead has to be
        // moved here. It is what every layer's span, fade and video frame is
        // read against — left behind, the whole take renders at time zero, and
        // anything that does not start at zero never appears at all.
        playhead.value = clock?.now ?? 0
        await nextTick()

        await captureStage()
        await syncVideoFrames(playhead.value, true)
        renderer?.render(shotSettings.value, clock?.now ?? 0, layerPlanes.value, overlayQuads.value)
      },
    })

    download(blob, takeName(takeSubject.value, container === 'mp4' ? 'mp4' : 'webm'))
  } catch (cause) {
    if ((cause as Error)?.name !== 'AbortError') {
      error.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {
    // Stay virtual. The preview runs on this clock too, so handing time back to
    // the real loop here would silently drop `speed` until the next reload.
    clock?.reset()
    invalidateStageMarkup()
    renderer.resize(previewSize.value.width, previewSize.value.height)
    lastCaptureAt = 0
    lastFrameAt = 0
    frameDebt = 0
    busy.value = false
    abort = null
    void seekTo(0)
  }
}

function cancelExport() {
  abort?.abort()
}

/**
 * Camera gestures on the frame itself. Disabled while the focus picker is armed,
 * so that click means "focus here" and nothing else.
 */
const gestures = useCameraGestures(
  settings,
  () => !picking.value && !busy.value,
  () => renderer?.distanceFor(shotSettings.value) ?? 1,
)

defineShortcuts({
  r: replay,
  h: () => {
    panelVisible.value = !panelVisible.value
  },
})

// Space is the universal transport key and is not something `defineShortcuts`
// covers; it also has to be stopped from scrolling or re-triggering a button.
function onKeydown(event: KeyboardEvent) {
  if (event.repeat) return
  const target = event.target as HTMLElement | null
  // Never steal a key from a field someone is typing in.
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable) return

  const accel = event.metaKey || event.ctrlKey
  if (accel && event.key === 'c') {
    copySelected()
    return
  }
  if (accel && event.key === 'v') {
    event.preventDefault()
    pasteClipboard()
    return
  }
  if (accel && event.key === 'd') {
    event.preventDefault()
    duplicateSelected()
    return
  }
  if (!accel && (event.key === 'Delete' || event.key === 'Backspace') && selectedId.value) {
    event.preventDefault()
    removeSelected()
    return
  }
  if (!accel && event.key === 'Escape') {
    selectedId.value = null
    return
  }
  if (event.code === 'Space') {
    event.preventDefault()
    togglePlay()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="fixed inset-0 flex overflow-hidden bg-black">
    <div class="flex min-w-0 flex-1 flex-col">
      <main class="relative flex min-h-0 flex-1 items-center justify-center p-8">
        <canvas
          ref="canvas"
          class="max-h-full max-w-full touch-none border border-zinc-900"
          :class="picking ? 'cursor-crosshair border-blue-500/50' : gestures.active.value ? 'cursor-grabbing' : 'cursor-grab'"
          :style="{ aspectRatio: `${settings.outputWidth} / ${settings.outputHeight}` }"
          @click="onFrameClick"
          @pointerdown="gestures.onPointerDown"
          @pointermove="gestures.onPointerMove"
          @pointerup="gestures.onPointerUp"
          @pointercancel="gestures.onPointerUp"
          @wheel="gestures.onWheel"
        />

        <div class="pointer-events-none absolute bottom-4 left-4 font-mono text-[10px] text-zinc-700">
          <template v-if="picking">
            click the part of the frame that should be sharp
          </template>
          <template v-else>
            {{ settings.outputWidth }}×{{ settings.outputHeight }} · {{ layers.length }} layers · h to hide panel, r to replay
          </template>
        </div>

        <p
          v-if="error"
          class="absolute left-4 top-4 max-w-md border border-red-900/60 bg-red-950/40 px-3 py-2 font-mono text-[10px] leading-relaxed text-red-300"
        >
          {{ error }}
        </p>
      </main>

      <LabTimeline
        v-show="panelVisible"
        v-model:layers="layers"
        :playhead
        :length="settings.timelineLength"
        :playing
        :seeking
        :output-ms
        :frames="frameCount"
        :selected-id
        @scrub="seekTo"
        @toggle-play="togglePlay"
        @select="selectedId = $event"
        @add-text="addText"
        @add-image="addMedia"
        @add-component="addComponent"
        @duplicate="selectedId = $event; duplicateSelected()"
        @copy="copyLayer"
        @paste="pasteClipboard"
        @split="splitLayer"
        @remove="selectedId = $event; removeSelected()"
      />
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/png,image/jpeg,image/svg+xml,image/webp,video/mp4,video/webm,video/quicktime"
      class="hidden"
      @change="onImagePicked"
    >

    <LabPanel
      v-show="panelVisible"
      v-model:settings="settings"
      v-model:show-source="showSource"
      v-model:picking="picking"
      v-model:camera="camera"
      :link-copied
      :busy
      :progress
      :high-precision
      :capture-ms
      :selected-layer
      @update-layer="updateLayer"
      @remove-layer="removeSelected"
      @duplicate-layer="duplicateSelected"
      @preset="onPreset"
      @fit="resetCamera"
      @fit-stage="fitStage"
      @replay="replay"
      @export-video="exportVideo"
      @export-png="exportPng"
      @copy-link="copyLink"
      @reset-settings="resetSettings"
      @reset-everything="resetEverything"
      @cancel="cancelExport"
    />

    <!--
      The live stage. It has to be genuinely on screen and not display:none —
      most of these components start themselves from an IntersectionObserver,
      which reports nothing for a hidden element. So it sits pinned behind the
      UI at near-zero opacity, where it lays out and animates normally.
    -->
    <div
      ref="stagesRoot"
      class="pointer-events-none fixed left-0 top-0"
      :class="showSource ? 'z-50 opacity-100' : 'z-0 opacity-[0.002]'"
    >
      <div
        v-for="staged in stagedComponents"
        :key="staged.layer.id"
        :data-stage="staged.layer.id"
        class="overflow-hidden bg-default"
        :style="{ width: `${settings.stageWidth}px`, height: `${settings.stageHeight}px` }"
      >
        <component :is="staged.component" v-if="staged.component" :key="stageKey" />
      </div>
    </div>
  </div>
</template>
