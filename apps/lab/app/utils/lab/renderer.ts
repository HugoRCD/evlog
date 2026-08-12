/**
 * The post-processing pipeline.
 *
 * stage → depth of field → stylize → bloom (mip chain) → streak → composite.
 *
 * The screen sits where the scene does, not at the end: it is a thing that
 * emits, so everything the lens does happens to it rather than over it.
 *
 * Every intermediate target is half-float where the driver allows it, because
 * bloom needs values above 1.0 to survive between passes — clamped at 8 bits, a
 * highlight is just white and the glow it should have thrown away is gone before
 * the threshold ever sees it.
 */

import { Renderer } from './gl'
import type { Program, Target } from './gl'
import {
  BLIT_FRAG,
  BLOOM_DOWN_FRAG,
  BLOOM_PREFILTER_FRAG,
  BLOOM_UP_FRAG,
  COMPOSITE_FRAG,
  DOF_FRAG,
  OVERLAY_FRAG,
  STAGE_FRAG,
  STREAK_FRAG,
  STYLIZE_FRAG,
} from './shaders'
import { bloomKneeFor, dofSamplesFor, hexToLinearRgb } from './settings'
import type { LabSettings, StylizeMode } from './settings'
import { asciiCellAspect } from './ascii'

/** Half-height of the staged plane in world units; width follows the source aspect. */
const PLANE_HALF_HEIGHT = 1

/** A layer drawn flat on the finished frame, in frame fractions with y up. */
export interface OverlayQuad {
  id: string
  /** Multiplier pushing the art above white, so bloom has something to catch. */
  emission: number
  x: number
  y: number
  halfWidth: number
  halfHeight: number
  rotation: number
  opacity: number
}

/** A layer, resolved into something the renderer can place in the scene. */
export interface LayerPlane {
  id: string
  /** Overlays skip the camera; kept here so one list can carry both. */
  overlay?: boolean
  /** Offset from the plate along the view axis; negative floats towards the camera. */
  depth: number
  offsetX: number
  offsetY: number
  halfWidth: number
  halfHeight: number
  rotation: number
  opacity: number
  emission: number
}

/** The part of a plane that decides where it lands on screen. */
export type PlaneGeometry = Pick<LayerPlane, 'offsetX' | 'offsetY' | 'depth' | 'halfWidth' | 'halfHeight' | 'rotation'>

const DEGREES = Math.PI / 180

/**
 * Which branch of the stylize shader each mode selects.
 *
 * `none` is absent rather than mapped to zero: the pass does not run at all,
 * which is what keeps the default pipeline exactly as long as it was.
 */
const STYLIZE_BRANCH: Partial<Record<StylizeMode, number>> = {
  dither: 1,
  ascii: 2,
  halftone: 3,
  posterize: 4,
  crt: 5,
}

export class LabRenderer {
  private renderer: Renderer
  /** Aspect of the staging area, which sets how the camera frames the scene. */
  private stageAspect = 16 / 9

  private stage: Program
  private dof: Program
  private prefilter: Program
  private down: Program
  private up: Program
  private composite: Program
  private streak: Program
  private stylize: Program
  private overlay: Program
  private blit: Program

  private layerTextures = new Map<string, WebGLTexture>()
  private sceneTarget: Target
  private dofTarget: Target
  private screenTarget: Target
  private bloomChain: Target[] = []
  /** Ping-pong pair for the streak, at the first bloom mip's size. */
  private streakTargets: [Target, Target] | null = null
  private width = 0
  private height = 0

  /** The ascii ramp, and how many glyphs are in it. Null until one is handed over. */
  private glyphs: { texture: WebGLTexture, count: number, gain: number } | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas)

    this.stage = this.renderer.fragment(STAGE_FRAG, 'stage')
    this.dof = this.renderer.fragment(DOF_FRAG, 'dof')
    this.prefilter = this.renderer.fragment(BLOOM_PREFILTER_FRAG, 'bloom-prefilter')
    this.down = this.renderer.fragment(BLOOM_DOWN_FRAG, 'bloom-down')
    this.up = this.renderer.fragment(BLOOM_UP_FRAG, 'bloom-up')
    this.composite = this.renderer.fragment(COMPOSITE_FRAG, 'composite')
    this.streak = this.renderer.fragment(STREAK_FRAG, 'streak')
    this.stylize = this.renderer.fragment(STYLIZE_FRAG, 'stylize')
    this.overlay = this.renderer.fragment(OVERLAY_FRAG, 'overlay')
    this.blit = this.renderer.fragment(BLIT_FRAG, 'blit')

    // Two attachments: colour, and the circle of confusion kept out of its alpha.
    this.sceneTarget = this.renderer.createTarget(2, 2, { attachments: 2 })
    this.dofTarget = this.renderer.createTarget(2, 2)
    // Half-float like the rest of the chain, and for the same reason: a screen
    // is a light source, so its hot cells carry values above 1.0 that the bloom
    // threshold has to still be able to see.
    this.screenTarget = this.renderer.createTarget(2, 2)
  }

  /**
   * Hand over the glyph ramp the ascii screen draws with.
   *
   * Built outside the renderer because it is a rasterization job, not a GL one —
   * and because it has to wait for the fonts to load, which the renderer has no
   * business knowing about. See `ascii.ts`.
   */
  setGlyphAtlas(image: TexImageSource, count: number, gain: number) {
    let texture = this.glyphs?.texture
    if (!texture) texture = this.renderer.createSourceTexture(false)
    this.renderer.upload(texture, image, false)
    this.glyphs = { texture, count, gain }
  }

  get canvas() {
    return this.renderer.canvas
  }

  /** True when the driver gave us renderable half-float targets. */
  get highPrecision() {
    return this.renderer.floatTargets
  }

  setStageAspect(aspect: number) {
    this.stageAspect = aspect
  }

  /** Upload — or replace — the art for one layer, keyed by its identity. */
  setLayerTexture(id: string, image: TexImageSource) {
    let texture = this.layerTextures.get(id)
    if (!texture) {
      texture = this.renderer.createSourceTexture()
      this.layerTextures.set(id, texture)
    }
    this.renderer.upload(texture, image)
  }

  dropLayerTexture(id: string) {
    const texture = this.layerTextures.get(id)
    if (!texture) return
    this.renderer.gl.deleteTexture(texture)
    this.layerTextures.delete(id)
  }

  resize(width: number, height: number) {
    const w = Math.max(2, Math.round(width))
    const h = Math.max(2, Math.round(height))
    if (w === this.width && h === this.height) return
    this.width = w
    this.height = h

    this.renderer.canvas.width = w
    this.renderer.canvas.height = h
    this.sceneTarget.resize(w, h)
    this.dofTarget.resize(w, h)
    this.screenTarget.resize(w, h)
    this.rebuildBloomChain()
  }

  /**
   * Bloom mips, starting at half resolution.
   *
   * The chain stops at 8px rather than 1px: the last couple of mips contribute
   * a flat wash over the whole frame and mostly cost fill rate.
   */
  private rebuildBloomChain() {
    for (const target of this.bloomChain) target.dispose()
    this.bloomChain = []

    let w = Math.floor(this.width / 2)
    let h = Math.floor(this.height / 2)
    while (this.bloomChain.length < 7 && w >= 8 && h >= 8) {
      this.bloomChain.push(this.renderer.createTarget(w, h))
      w = Math.floor(w / 2)
      h = Math.floor(h / 2)
    }
    // Degenerate output sizes still need one level for the composite to sample.
    if (!this.bloomChain.length) this.bloomChain.push(this.renderer.createTarget(8, 8))

    for (const target of this.streakTargets ?? []) target.dispose()
    const [first] = this.bloomChain
    this.streakTargets = first
      ? [
        this.renderer.createTarget(first.width, first.height),
        this.renderer.createTarget(first.width, first.height),
      ]
      : null
  }

  render(settings: LabSettings, time: number, planes: LayerPlane[] = [], overlays: OverlayQuad[] = []) {
    this.renderStage(settings, planes.filter(plane => !plane.overlay))

    // The screen stands in for the scene from here on. It emits light like
    // anything else in front of the lens, so the glow, the streak and the whole
    // grade run on it rather than over it.
    const branch = this.stylizeBranch(settings)
    const scene = branch ? this.renderStylize(settings, branch) : this.renderDof(settings)

    const bloom = this.renderBloom(settings, scene)
    const streak = this.renderStreak(settings, bloom)
    this.renderComposite(settings, time, { scene, bloom, streak })

    this.renderOverlays(overlays)
  }

  /**
   * The shader branch a shot's screen selects, or null for no screen at all.
   *
   * Ascii also needs its ramp, and the atlas is built asynchronously — a shot
   * that opens with ascii already set would otherwise draw one frame of solid
   * black while the fonts load. Falling through to no screen for that frame is
   * the honest answer: the picture is simply not stylized yet.
   */
  private stylizeBranch(settings: LabSettings): number | null {
    const branch = STYLIZE_BRANCH[settings.stylize]
    if (!branch) return null
    if (settings.stylize === 'ascii' && !this.glyphs) return null
    return branch
  }

  /**
   * Redraw the scene through a screen, into the target the rest of the chain reads.
   *
   * Fed the depth of field's output rather than the raw stage, so the bokeh is
   * part of what the cells sample: a defocused region resolves to soft cells
   * rather than to sharp cells full of noise.
   *
   * The cell size is authored against a 1080p frame and scaled to whatever is
   * being rendered, for the same reason the bokeh radius is: left in device
   * pixels the cells would be a different size in the preview than in the
   * export, and would change every time the window was resized.
   */
  private renderStylize(settings: LabSettings, branch: number): Target {
    const { renderer } = this
    const source = this.renderDof(settings)
    const cell = Math.max(2, settings.stylizeScale * (this.height / 1080))

    renderer.bind(this.screenTarget)
    this.stylize.use()
    this.stylize.set('uSource', source.texture)
    if (this.glyphs) this.stylize.set('uGlyphs', this.glyphs.texture)
    this.stylize.set('uGlyphCount', this.glyphs?.count ?? 1)
    this.stylize.set('uGlyphGain', this.glyphs?.gain ?? 1)
    this.stylize.set('uResolution', [this.width, this.height])
    // Letters are about twice as tall as they are wide, so a ramp made of them
    // is laid out in cells that shape — a square cell stretches every glyph and
    // squashes the picture. A ramp of blocks and marks has no such bias and gets
    // square cells, which is what makes it read as a matrix rather than as type.
    this.stylize.set('uCell', [cell, cell * this.cellAspect(settings)])
    this.stylize.set('uLevels', settings.stylizeLevels)
    this.stylize.set('uColour', settings.stylizeColour)
    this.stylize.set('uAngle', settings.stylizeAngle * DEGREES)
    this.stylize.set('uMask', settings.stylizeMask)
    this.stylize.set('uMode', branch)
    renderer.draw()
    return this.screenTarget
  }

  private cellAspect(settings: LabSettings): number {
    return settings.stylize === 'ascii' ? asciiCellAspect(settings.asciiSet) : 1
  }

  /**
   * Overlays go last, straight onto the canvas.
   *
   * After the grade rather than before it, so an overlay is not tone-mapped,
   * vignetted or grained along with the footage — it is applied to the picture,
   * not part of it.
   */
  private renderOverlays(overlays: OverlayQuad[]) {
    if (!overlays.length) return
    const { renderer } = this
    const { gl } = renderer

    renderer.bind(null)
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    for (const quad of overlays) {
      const texture = this.layerTextures.get(quad.id)
      if (!texture) continue
      this.overlay.use()
      this.overlay.set('uSource', texture)
      this.overlay.set('uCentre', [quad.x, quad.y])
      this.overlay.set('uHalfSize', [quad.halfWidth, quad.halfHeight])
      this.overlay.set('uRotation', quad.rotation * DEGREES)
      this.overlay.set('uAspect', this.width / this.height)
      this.overlay.set('uOpacity', quad.opacity)
      renderer.draw()
    }

    gl.disable(gl.BLEND)
  }


  /**
   * Resolve the camera from the framing-relative settings.
   *
   * `zoom` is stored as a ratio rather than a world distance so a look survives
   * a change of stage size, aspect or field of view. A preset that hard-coded
   * "distance 3.5" frames a 16:9 component and slices a wide one in half; zoom 1
   * means edge-to-edge for both.
   *
   * The depth span is the range the focus control works in: the view-space depth
   * of the plate's nearest and farthest corner under the current rotation. When
   * the plate faces the camera square-on the two collapse, which is not a bug —
   * a flat surface parallel to the sensor is uniformly in focus, and tilt is
   * what creates something to focus through.
   */
  private camera(settings: LabSettings) {
    const fit = distanceToFit(settings.fov, this.width / this.height, this.stageAspect)
    const distance = fit / Math.max(settings.zoom, 0.05)

    const basis = rotationMatrix(settings.pitch * DEGREES, settings.yaw * DEGREES, settings.roll * DEGREES)
    // Only the Z component of each in-plane axis matters: depth is the camera-Z
    // of a point, and panning moves the plate without changing its depth.
    //
    // Column-major, so the plate's right axis is columns 0 (indices 0..2) and its
    // up axis is column 1 (3..5); column 2 is the normal and says nothing about
    // how the surface recedes.
    const rightZ = basis[2] ?? 0
    const upZ = basis[5] ?? 0
    const halfWidth = PLANE_HALF_HEIGHT * this.stageAspect
    const halfHeight = PLANE_HALF_HEIGHT

    let near = Infinity
    let far = -Infinity
    for (const u of [-1, 1]) {
      for (const v of [-1, 1]) {
        const depth = distance - rightZ * u * halfWidth - upZ * v * halfHeight
        near = Math.min(near, depth)
        far = Math.max(far, depth)
      }
    }

    return { distance, near, far }
  }

  /**
   * Focal-plane position of whatever the plate shows at a screen point.
   *
   * Mirrors the stage shader's ray-plane intersection on the CPU so a click can
   * be turned into a `focus` value. Picking the subject beats hunting for it on
   * a slider — the mapping from focal plane to what ends up sharp is not
   * something anyone can predict from a number under a tilt.
   *
   * `ndc` is in clip space: -1..1, y up. Returns null when the ray misses the
   * plate, or when the plate is square-on and has no depth to focus through.
   */
  focusAt(settings: LabSettings, ndcX: number, ndcY: number): number | null {
    const { distance, near, far } = this.camera(settings)
    const span = far - near
    if (span <= 1e-4) return null

    const tanHalfFov = Math.tan((settings.fov * DEGREES) / 2)
    const aspect = this.width / this.height
    const dir = normalize([ndcX * aspect * tanHalfFov, ndcY * tanHalfFov, -1])

    const basis = rotationMatrix(settings.pitch * DEGREES, settings.yaw * DEGREES, settings.roll * DEGREES)
    const right: Vec3 = [basis[0] ?? 0, basis[1] ?? 0, basis[2] ?? 0]
    const up: Vec3 = [basis[3] ?? 0, basis[4] ?? 0, basis[5] ?? 0]
    const normal: Vec3 = [basis[6] ?? 0, basis[7] ?? 0, basis[8] ?? 0]
    const centre: Vec3 = [settings.panX, settings.panY, -distance]

    const denom = dot(dir, normal)
    if (Math.abs(denom) < 1e-5) return null
    const t = dot(centre, normal) / denom
    if (t <= 0) return null

    const hit: Vec3 = [dir[0] * t, dir[1] * t, dir[2] * t]
    const local: Vec3 = [hit[0] - centre[0], hit[1] - centre[1], hit[2] - centre[2]]
    // `stageAspect`, not a `sourceAspect` this class never had: undefined made
    // `halfWidth` NaN, every comparison against it false, and the bounds test a
    // no-op — so a click that missed the plate still racked the focus onto it.
    const halfWidth = PLANE_HALF_HEIGHT * this.stageAspect
    if (Math.abs(dot(local, right)) > halfWidth || Math.abs(dot(local, up)) > PLANE_HALF_HEIGHT) return null

    return Math.min(1, Math.max(0, (-hit[2] - near) / span))
  }

  /**
   * Camera distance the current settings resolve to.
   *
   * Exposed for pan gestures: converting a pointer delta into world units needs
   * to know how much world one pixel covers, which scales with distance.
   */
  distanceFor(settings: LabSettings): number {
    return this.camera(settings).distance
  }

  /**
   * Where a plane's four corners land on the frame, as fractions with y down.
   *
   * The same projection the stage shader does, on the CPU, because a selection
   * box has to sit exactly on the thing it selects — and under a tilt that
   * outline is a general quadrilateral, not a rectangle. Anything drawn from a
   * centre and a size would be square to the screen while the layer it claims to
   * be around is not.
   *
   * Fractions rather than pixels so the caller can place handles against the
   * frame element without knowing the render resolution.
   *
   * Null when any corner is level with or behind the camera: the projection is
   * meaningless there, and half a box drawn from the corners that did resolve
   * would point somewhere the layer is not.
   */
  projectPlane(settings: LabSettings, plane: PlaneGeometry): [number, number][] | null {
    const { distance } = this.camera(settings)
    const tanHalfFov = Math.tan((settings.fov * DEGREES) / 2)
    const aspect = this.width / this.height

    const basis = rotationMatrix(
      settings.pitch * DEGREES,
      settings.yaw * DEGREES,
      (settings.roll + plane.rotation) * DEGREES,
    )
    const right: Vec3 = [basis[0] ?? 0, basis[1] ?? 0, basis[2] ?? 0]
    const up: Vec3 = [basis[3] ?? 0, basis[4] ?? 0, basis[5] ?? 0]
    const centre: Vec3 = [
      settings.panX + plane.offsetX,
      settings.panY + plane.offsetY,
      -(distance + plane.depth),
    ]

    const corners: [number, number][] = []
    for (const [u, v] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
      const x = centre[0] + right[0] * u * plane.halfWidth + up[0] * v * plane.halfHeight
      const y = centre[1] + right[1] * u * plane.halfWidth + up[1] * v * plane.halfHeight
      const z = centre[2] + right[2] * u * plane.halfWidth + up[2] * v * plane.halfHeight
      if (-z <= 1e-3) return null

      const ndcX = x / (-z * tanHalfFov * aspect)
      const ndcY = y / (-z * tanHalfFov)
      corners.push([ndcX * 0.5 + 0.5, 0.5 - ndcY * 0.5])
    }
    return corners
  }

  /**
   * How much world a whole frame covers at a given depth.
   *
   * What turns a drag across the frame into a displacement of the thing being
   * dragged. It falls off with depth because perspective does: a layer pushed
   * back has to travel further in world units to cross the same distance on
   * screen, and a drag that ignored that would slide a distant layer under the
   * pointer instead of with it.
   */
  worldPerFrame(settings: LabSettings, depth: number): { x: number, y: number } {
    const { distance } = this.camera(settings)
    const tanHalfFov = Math.tan((settings.fov * DEGREES) / 2)
    const height = 2 * tanHalfFov * Math.max(distance + depth, 1e-3)
    return { x: height * (this.width / this.height), y: height }
  }

  private renderStage(settings: LabSettings, planes: LayerPlane[]) {
    const { renderer } = this
    const { gl } = renderer
    const { distance, near, far } = this.camera(settings)
    renderer.bind(this.sceneTarget)

    // The background is the clear value rather than something a plane paints, so
    // every plane — the component included — composites the same way.
    const [r, g, b] = hexToLinearRgb(settings.background)
    renderer.clearAttachment(0, [r, g, b, 1])
    // 0.5 unpacks to a circle of confusion of zero: the backdrop is in focus.
    // 0.5 unpacks to a circle of confusion of zero: the backdrop is in focus.
    renderer.clearAttachment(1, [0.5, 0.5, 0.5, 1])

    // Painter's algorithm, far to near, with premultiplied source. Colour and
    // focus both blend by coverage, which is what keeps a layer opaque where its
    // art is opaque no matter how blurred it happens to be.
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    for (const plane of [...planes].sort((a, b) => b.depth - a.depth)) {
      const texture = this.layerTextures.get(plane.id)
      if (texture) this.drawPlane(settings, { distance, near, far }, { ...plane, texture })
    }

    gl.disable(gl.BLEND)
  }

  /**
   * One plane of the scene: the component's plate, or a layer floating off it.
   *
   * Layers are placed relative to the plate rather than to the camera, so
   * moving the camera carries the whole composition instead of sliding the
   * overlays out of it.
   */
  private drawPlane(
    settings: LabSettings,
    camera: { distance: number, near: number, far: number },
    plane: LayerPlane & { texture: WebGLTexture },
  ) {
    const { renderer } = this
    const { distance, near, far } = camera

    this.stage.use()
    this.stage.set('uSource', plane.texture)
    this.stage.set('uPlaneSize', [plane.halfWidth, plane.halfHeight])
    this.stage.set('uPlaneOffset', [settings.panX + plane.offsetX, settings.panY + plane.offsetY, distance + plane.depth])
    this.stage.set('uRotation', [settings.pitch * DEGREES, settings.yaw * DEGREES, (settings.roll + plane.rotation) * DEGREES])
    this.stage.set('uOpacity', plane.opacity)
    this.stage.set('uEmission', plane.emission)
    this.stage.set('uResolution', [this.width, this.height])
    this.stage.set('uTanHalfFov', Math.tan((settings.fov * DEGREES) / 2))
    this.stage.set('uFocusNear', near)
    this.stage.set('uFocusFar', far)
    this.stage.set('uFocus', settings.focus)
    this.stage.set('uFocusRange', settings.focusRange)
    // Falloff is measured from the camera distance, not the focal plane, so
    // racking focus does not also change how dark the far edge sits.
    this.stage.set('uReferenceDistance', distance)
    this.stage.set('uAperture', settings.aperture)
    this.stage.set('uAttenuation', settings.attenuation)
    this.stage.set('uBackground', hexToLinearRgb(settings.background))
    renderer.draw()
  }

  private renderDof(settings: LabSettings): Target {
    if (settings.aperture <= 0 || settings.blurRadius <= 0) return this.sceneTarget

    const { renderer } = this
    renderer.bind(this.dofTarget)
    this.dof.use()
    this.dof.set('uSource', this.sceneTarget.texture)
    this.dof.set('uCocMap', this.sceneTarget.textures[1] ?? this.sceneTarget.texture)
    this.dof.set('uTexel', [1 / this.width, 1 / this.height])
    // `blurRadius` is authored against a 1080p frame and scaled to whatever is
    // being rendered. Left in raw device pixels it would mean a different look
    // in the preview than in the export — and would visibly change every time
    // the window was resized, since the preview buffer follows the element.
    this.dof.set('uMaxRadius', settings.blurRadius * (this.height / 1080))
    // The shader loop is bounded at 256; the UI caps lower, but a hand-edited
    // URL should not be able to hang the GPU.
    this.dof.set('uSamples', dofSamplesFor(settings.blurRadius))
    this.dof.set('uBlades', settings.bokehBlades)
    this.dof.set('uCatEye', settings.bokehCatEye)
    renderer.draw()
    return this.dofTarget
  }

  private renderBloom(settings: LabSettings, scene: Target): Target {
    const { renderer } = this
    const { gl } = renderer
    const [first] = this.bloomChain
    if (!first) return scene

    renderer.bind(first)
    renderer.clear(0, 0, 0, 1)
    if (settings.bloomIntensity <= 0) return first

    this.prefilter.use()
    this.prefilter.set('uSource', scene.texture)
    this.prefilter.set('uThreshold', settings.bloomThreshold)
    this.prefilter.set('uKnee', bloomKneeFor(settings.bloomThreshold))
    this.prefilter.set('uBleed', settings.bleed)
    renderer.draw()

    for (let i = 1; i < this.bloomChain.length; i++) {
      const target = this.bloomChain[i]
      const previous = this.bloomChain[i - 1]
      if (!target || !previous) continue
      renderer.bind(target)
      this.down.use()
      this.down.set('uSource', previous.texture)
      this.down.set('uTexel', [1 / previous.width, 1 / previous.height])
      renderer.draw()
    }

    // Walk back up, adding each level into the one above. Additive blending is
    // what makes the falloff look like light rather than a stack of blurs.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    for (let i = this.bloomChain.length - 1; i > 0; i--) {
      const source = this.bloomChain[i]
      const target = this.bloomChain[i - 1]
      if (!source || !target) continue
      renderer.bind(target)
      this.up.use()
      this.up.set('uSource', source.texture)
      this.up.set('uTexel', [1 / source.width, 1 / source.height])
      this.up.set('uRadius', settings.bloomRadius)
      renderer.draw()
    }
    gl.disable(gl.BLEND)

    return first
  }

  /**
   * The anamorphic streak, spread horizontally out of the thresholded bloom.
   *
   * Three passes with the stride multiplied by the tap count each time, so the
   * reach compounds: nine taps at strides of 1, 9 and 81 cover eight hundred
   * pixels between them, where one kernel wide enough to do that alone would
   * cost a hundred times as many samples.
   */
  private renderStreak(settings: LabSettings, bloom: Target): Target | null {
    if (settings.streaks <= 0 || !this.streakTargets) return null

    const { renderer } = this
    const [a, b] = this.streakTargets
    let source = bloom
    // Authored against a 1080-high frame, like the bokeh radius and the screen
    // cell. Left in raw texels the streak covered a fixed number of pixels of
    // whatever buffer it ran on, so the same shot flared a third of the way
    // across a 1080 export and half as far across a 4K one.
    let stride = Math.max(1, this.height / 1080)

    for (let pass = 0; pass < 3; pass++) {
      const target = pass % 2 === 0 ? a : b
      renderer.bind(target)
      this.streak.use()
      this.streak.set('uSource', source.texture)
      this.streak.set('uTexel', [1 / target.width, 1 / target.height])
      this.streak.set('uStride', stride)
      renderer.draw()
      source = target
      stride *= 9
    }
    return source
  }

  private renderComposite(settings: LabSettings, time: number, pass: { scene: Target, bloom: Target, streak: Target | null }) {
    const { renderer } = this
    const { scene, bloom, streak } = pass
    renderer.bind(null)
    this.composite.use()
    this.composite.set('uScene', scene.texture)
    this.composite.set('uBloom', bloom.texture)
    this.composite.set('uStreak', (streak ?? bloom).texture)
    this.composite.set('uStreaks', streak ? settings.streaks : 0)
    this.composite.set('uGhosts', settings.ghosts)
    this.composite.set('uTanHalfFov', Math.tan((settings.fov * DEGREES) / 2))
    this.composite.set('uResolution', [this.width, this.height])
    this.composite.set('uBloomIntensity', settings.bloomIntensity)
    this.composite.set('uDistortion', settings.distortion)
    this.composite.set('uAberration', settings.aberration)
    this.composite.set('uDispersion', settings.dispersion)
    this.composite.set('uLensNoise', settings.lensNoise)
    this.composite.set('uDuotone', settings.duotone)
    this.composite.set('uDuotoneShadow', hexToLinearRgb(settings.duotoneShadow))
    this.composite.set('uDuotoneHighlight', hexToLinearRgb(settings.duotoneHighlight))
    this.composite.set('uExposure', settings.exposure)
    this.composite.set('uContrast', settings.contrast)
    this.composite.set('uSaturation', settings.saturation)
    this.composite.set('uVignette', settings.vignette)
    this.composite.set('uGrain', settings.grain)
    // Wrapped into 0..1 before it reaches the shader. The hash only needs the
    // frames to differ, and keeping the magnitude small is what stops the grain
    // from degrading as the page stays open.
    this.composite.set('uTime', (time % 1000) / 1000)
    this.composite.set('uTonemap', settings.tonemap)
    renderer.draw()
  }

  /** Present a target straight to the canvas — used when debugging a pass. */
  debug(target: Target) {
    this.renderer.bind(null)
    this.blit.use()
    this.blit.set('uSource', target.texture)
    this.renderer.draw()
  }

  dispose() {
    const programs = [this.stage, this.dof, this.prefilter, this.down, this.up, this.composite, this.streak, this.stylize, this.overlay, this.blit]
    for (const program of programs) program.dispose()
    const targets = [this.sceneTarget, this.dofTarget, this.screenTarget, ...this.bloomChain, ...this.streakTargets ?? []]
    for (const target of targets) target.dispose()
    for (const texture of this.layerTextures.values()) this.renderer.gl.deleteTexture(texture)
    if (this.glyphs) this.renderer.gl.deleteTexture(this.glyphs.texture)
    this.layerTextures.clear()
    this.renderer.dispose()
  }
}

type Vec3 = [number, number, number]

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

/**
 * Rotation basis, column-major to match the shader's `mat3` construction so the
 * CPU and GPU agree on which way the plate is facing.
 */
function rotationMatrix(pitch: number, yaw: number, roll: number): number[] {
  const cx = Math.cos(pitch), sx = Math.sin(pitch)
  const cy = Math.cos(yaw), sy = Math.sin(yaw)
  const cz = Math.cos(roll), sz = Math.sin(roll)

  const rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx]
  const ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy]
  const rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1]

  return multiply(multiply(ry, rx), rz)
}

/** Column-major 3×3 product. */
function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(9).fill(0)
  for (let column = 0; column < 3; column++) {
    for (let row = 0; row < 3; row++) {
      let sum = 0
      for (let k = 0; k < 3; k++) sum += (a[k * 3 + row] ?? 0) * (b[column * 3 + k] ?? 0)
      out[column * 3 + row] = sum
    }
  }
  return out
}

/**
 * Camera distance that frames the plane edge-to-edge for a given field of view.
 *
 * Used by the "fit" control so changing format or FOV does not mean hunting for
 * the distance that puts the component back in frame.
 */
export function distanceToFit(fov: number, outputAspect: number, sourceAspect: number): number {
  const tanHalf = Math.tan((fov * DEGREES) / 2)
  const byHeight = PLANE_HALF_HEIGHT / tanHalf
  const byWidth = (PLANE_HALF_HEIGHT * sourceAspect) / (tanHalf * outputAspect)
  return Math.max(byHeight, byWidth)
}
