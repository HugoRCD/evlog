/**
 * The lab's parameter set, its presets, and URL round-tripping.
 *
 * Every knob lives in one flat object so a shot is fully described by a URL —
 * paste it back and you get the exact same frame. That is what makes a take
 * reproducible a month later when the component has changed and the release
 * video needs a reshoot.
 */

export interface LabSettings {
  /**
   * The viewport the component is laid out in, in CSS pixels.
   *
   * Set by the device presets rather than typed: this is the width a responsive
   * component reads to decide its layout, so the useful values are the ones real
   * screens have.
   */
  stageWidth: number
  stageHeight: number
  /** Output frame size, set by the delivery presets. */
  outputWidth: number
  outputHeight: number
  /** Frame rate of the export, one of `FRAME_RATES`. */
  fps: number
  /**
   * How far into the component's own timeline the lab can scrub, in ms.
   *
   * The components loop on their own schedule and never announce a length, so
   * this is the window being inspected rather than anything they report.
   */
  timelineLength: number
  /**
   * Extra time after the last clip, in ms.
   *
   * The timeline cannot be shorter than its content — that is what left the
   * playhead past every layer on a black frame. Longer is a deliberate choice:
   * a beat of black to land on after a fade out.
   */
  tail: number

  /** Container for the exported video. */
  container: string
  /**
   * Animation playback rate. Below 1 the component is stepped in smaller
   * increments per frame, so the same take covers less of the sequence and
   * plays back slower — real slow motion, not frame duplication.
   */
  speed: number

  // Camera
  pitch: number
  yaw: number
  roll: number
  /** Framing, relative to the distance that fits the plane exactly. 1 = edge to edge. */
  zoom: number
  fov: number
  panX: number
  panY: number

  // Focus
  /** Focal plane across the plate's own depth span. 0 = nearest edge, 1 = farthest. */
  focus: number
  /** Half-width of the sharp band, in that same 0..1 span. Small = razor thin. */
  focusRange: number
  /** Maximum bokeh radius, in pixels of a 1080p frame; scaled to the real one. */
  aperture: number
  blurRadius: number
  dofSamples: number

  // Bloom
  bloomIntensity: number
  bloomThreshold: number
  bloomKnee: number
  bloomRadius: number

  // Grade
  emission: number
  exposure: number
  contrast: number
  saturation: number
  tonemap: boolean
  aberration: number
  vignette: number
  grain: number
  attenuation: number
  background: string

  /**
   * Name of the look in force, or empty for none.
   *
   * The values it produced are written into the fields above rather than being
   * resolved from here on every frame — the renderer reads one flat set of
   * numbers, and a look is only ever a way of filling them in. This is kept so
   * the amount dial knows what to re-blend from, and so a chip can be lit.
   */
  look: string
  /** Strength of that look, 0 = neutral, 1 = as authored. See `looks.ts`. */
  lookAmount: number
}

export const DEFAULT_SETTINGS: LabSettings = {
  stageWidth: 1100,
  stageHeight: 720,
  outputWidth: 1920,
  outputHeight: 1080,
  fps: 30,
  timelineLength: 6000,
  tail: 0,
  container: 'mp4',
  speed: 1,

  pitch: 0,
  yaw: 0,
  roll: 0,
  zoom: 1,
  fov: 32,
  panX: 0,
  panY: 0,

  focus: 0.5,
  focusRange: 0.35,
  aperture: 0,
  blurRadius: 12,
  dofSamples: 32,

  bloomIntensity: 0.35,
  bloomThreshold: 0.75,
  bloomKnee: 0.35,
  bloomRadius: 1,

  emission: 1,
  exposure: 1,
  contrast: 1,
  saturation: 1,
  tonemap: true,
  aberration: 0,
  vignette: 0.35,
  grain: 0.015,
  attenuation: 0,
  background: '#000000',

  // No look selected, and the grade above is left exactly as it was. Seeding a
  // look here would have shifted the look values, and every document already
  // stored omits whatever matches a default — so old shots would have silently
  // re-graded themselves on the next load.
  look: '',
  lookAmount: 1,
}

/** Bounds and step for every numeric control, driving both the UI and URL clamping. */
/**
 * One line per control that cannot be understood from its name.
 *
 * Only where a label genuinely falls short — a hint on `Exposure` would be
 * noise, and a panel where everything is annotated reads as a panel where
 * nothing is worth reading.
 */
export const HINTS: Partial<Record<string, string>> = {
  zoom: 'Framing relative to fitting the scene edge to edge. 1 fits exactly.',
  fov: 'Lens angle. Wide exaggerates the tilt; narrow flattens it.',
  focus: 'Where the sharp band sits across the scene depth. 0 is the nearest edge, 1 the farthest.',
  focusRange: 'How thick the sharp band is. Small leaves only a slice in focus.',
  aperture: 'How strongly out-of-focus areas blur. Zero turns depth of field off.',
  blurRadius: 'Widest the bokeh can grow, measured on a 1080p frame.',
  dofSamples: 'Taps per pixel in the bokeh. Higher is smoother and slower.',
  emission: 'How bright the picture is before it glows. Raise it to give bloom something to catch; it is what feeds the glow, not the glow itself.',
  attenuation: 'Darkens the scene as it recedes, which reads as depth.',
  bloomThreshold: 'Brightness a pixel must reach before it glows.',
  bloomKnee: 'Softness of that threshold, so glow fades in instead of popping.',
  bloomRadius: 'How far the glow spreads.',
  aberration: 'Splits the colour channels towards the edges, the way a real lens does.',
  tail: 'Black held after the last clip ends, so a shot can land instead of cutting.',
  speed: 'Playback rate. Below 1 the animation is stepped in smaller increments — real slow motion.',
  lookAmount: 'How far towards the look to go. Past 1 it is pushed beyond what it was authored at.',
} as const

export const RANGES = {
  pitch: { min: -60, max: 60, step: 0.5, unit: '°' },
  yaw: { min: -60, max: 60, step: 0.5, unit: '°' },
  roll: { min: -180, max: 180, step: 0.5, unit: '°' },
  zoom: { min: 0.3, max: 4, step: 0.005 },
  fov: { min: 8, max: 90, step: 0.5, unit: '°' },
  panX: { min: -3, max: 3, step: 0.01 },
  panY: { min: -3, max: 3, step: 0.01 },

  focus: { min: 0, max: 1, step: 0.002 },
  focusRange: { min: 0.02, max: 1, step: 0.005 },
  aperture: { min: 0, max: 1.5, step: 0.005 },
  blurRadius: { min: 1, max: 90, step: 1, unit: 'px' },
  dofSamples: { min: 4, max: 128, step: 4 },

  bloomIntensity: { min: 0, max: 3, step: 0.005 },
  bloomThreshold: { min: 0, max: 2, step: 0.005 },
  bloomKnee: { min: 0.01, max: 1, step: 0.005 },
  bloomRadius: { min: 0.2, max: 4, step: 0.01 },

  emission: { min: 0.2, max: 4, step: 0.005 },
  exposure: { min: 0.05, max: 4, step: 0.005 },
  contrast: { min: 0.5, max: 2, step: 0.005 },
  saturation: { min: 0, max: 2, step: 0.005 },
  aberration: { min: 0, max: 3, step: 0.005 },
  vignette: { min: 0, max: 1, step: 0.005 },
  grain: { min: 0, max: 0.12, step: 0.001 },
  attenuation: { min: 0, max: 1, step: 0.005 },

  stageWidth: { min: 320, max: 2400, step: 10, unit: 'px' },
  stageHeight: { min: 240, max: 1600, step: 10, unit: 'px' },
  // Low minimums on purpose: clamping an output size silently changes the
  // aspect ratio of a shot, which is worse than allowing a small frame.
  outputWidth: { min: 240, max: 3840, step: 2, unit: 'px' },
  outputHeight: { min: 240, max: 2160, step: 2, unit: 'px' },
  tail: { min: 0, max: 10000, step: 50, unit: 'ms' },
  fps: { min: 12, max: 60, step: 1, unit: 'fps' },
  speed: { min: 0.1, max: 2, step: 0.05, unit: '×' },
  // Past 1 the look is extrapolated rather than reached — see MAX_LOOK_AMOUNT.
  lookAmount: { min: 0, max: 1.5, step: 0.01, unit: '×' },
} as const satisfies Record<string, { min: number, max: number, step: number, unit?: string }>

export type RangedKey = keyof typeof RANGES

/**
 * How densely the staged animation is rasterized.
 *
 * A constant rather than a control: two is sharp enough that text holds up at
 * 4K and cheap enough that capture stays interactive, and nobody shooting a
 * release video wants to be asked about supersampling first.
 */
export const PLATE_SCALE = 2

/**
 * Where the video is going, rather than what shape it is.
 *
 * A ratio is a fact about the frame; a destination is the reason you picked it.
 * "16:9" made you do the translation yourself every time — and the pixel count
 * still matters, so it is stated underneath instead of being the whole label.
 */
export const OUTPUT_PRESETS = [
  { id: 'post', label: 'X post', note: 'Landscape, the safe default', width: 1920, height: 1080 },
  { id: 'readme', label: 'README', note: 'Lighter file for a repo', width: 1600, height: 900 },
  { id: 'email', label: 'Email', note: 'Fits a newsletter column', width: 1200, height: 675 },
  { id: 'square', label: 'Square', note: 'Feeds that crop the sides', width: 1080, height: 1080 },
  { id: 'story', label: 'Shorts', note: 'Vertical, full screen', width: 1080, height: 1920 },
  { id: 'hero', label: 'Hero', note: 'Wide banner strip', width: 1920, height: 960 },
] as const

/**
 * Screens to lay the component out at.
 *
 * The viewport is the one setting here that changes what is being filmed rather
 * than how it is filmed — a component at 390 wide stacks what it lays side by
 * side at 1440 — so the presets are the widths that trip real breakpoints.
 */
export const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
  { id: 'laptop', label: 'Laptop', width: 1100, height: 720 },
  { id: 'tablet', label: 'Tablet', width: 834, height: 1112 },
  { id: 'phone', label: 'Phone', width: 390, height: 844 },
] as const

/**
 * The rates anyone actually delivers at.
 *
 * A slider invited you to land on 37fps, which is never what you meant.
 */
export const FRAME_RATES = [24, 30, 60] as const

/** Playback rates, as multiples of the animation's own speed. */
export const SPEEDS = [0.25, 0.5, 1, 2] as const

const BOOLEAN_KEYS = ['tonemap'] as const
const STRING_KEYS = ['background', 'container', 'look'] as const

function clampRanged(key: string, value: number): number {
  const range = (RANGES as Record<string, { min: number, max: number } | undefined>)[key]
  if (!range) return value
  return Math.min(range.max, Math.max(range.min, value))
}

/**
 * Clamp to a control's range and round to its step.
 *
 * Blending two looks lands between steps, and a slider handed 0.6173 shows one
 * number while holding another. Rounding at the source keeps every value in the
 * settings on the same grid the controls put them on.
 */
export function snapToRange(key: string, value: number): number {
  const range = (RANGES as Record<string, { min: number, max: number, step: number } | undefined>)[key]
  if (!range) return value

  const stepped = Math.round(value / range.step) * range.step
  const clamped = Math.min(range.max, Math.max(range.min, stepped))
  // The step is the precision: deriving it from the string avoids the float
  // noise that `0.1 * 3` style arithmetic leaves behind.
  const text = String(range.step)
  const dot = text.indexOf('.')
  return Number(clamped.toFixed(dot === -1 ? 0 : text.length - dot - 1))
}

/**
 * Serialize to a query string, omitting anything still at its default.
 *
 * Keeping defaults out is what makes a shared link readable: a shot that only
 * changed the tilt produces `?c=Foo&pitch=16`, not forty parameters.
 */
export function settingsToQuery(settings: LabSettings): Record<string, string> {
  const query: Record<string, string> = {}
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof LabSettings)[]) {
    const value = settings[key]
    if (value === DEFAULT_SETTINGS[key]) continue
    if (typeof value === 'number') query[key] = String(Number(value.toFixed(4)))
    else if (typeof value === 'boolean') query[key] = value ? '1' : '0'
    else if (value) query[key] = value
  }
  return query
}

/** Rebuild settings from a query, ignoring anything unrecognised or out of range. */
export function settingsFromQuery(query: Record<string, unknown>): LabSettings {
  const settings = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof LabSettings)[]) {
    const raw = query[key]
    if (raw === undefined || raw === null || Array.isArray(raw)) continue
    const value = String(raw)

    if ((STRING_KEYS as readonly string[]).includes(key)) {
      Object.assign(settings, { [key]: value })
    } else if ((BOOLEAN_KEYS as readonly string[]).includes(key)) {
      Object.assign(settings, { [key]: value === '1' || value === 'true' })
    } else {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) Object.assign(settings, { [key]: clampRanged(key, parsed) })
    }
  }
  return settings
}

/**
 * Output length in milliseconds.
 *
 * Derived rather than set. The timeline runs as long as its content and the
 * export covers all of it, so there is nothing to keep in agreement — an
 * in-point that could outlive the clips left the playhead past every layer's
 * span, and the frame simply went black.
 */
export function outputDuration(settings: LabSettings): number {
  return Math.max(0, settings.timelineLength / Math.max(settings.speed, 0.01))
}

/**
 * Component milliseconds one output frame covers.
 *
 * Every path that moves time — playback, scrubbing, export — steps by this, so
 * they all land on the same instants. Advancing at display rate in the preview
 * and at the frame rate in the export would put CSS transitions at different
 * phases, and the frame that was graded would not be the frame that renders.
 */
export function frameStep(settings: LabSettings): number {
  return (1000 / Math.max(settings.fps, 1)) * settings.speed
}

/** Frames the current segment will produce. */
export function frameCountFor(settings: LabSettings): number {
  return Math.max(1, Math.round((outputDuration(settings) / 1000) * settings.fps))
}

export function hexToLinearRgb(hex: string): [number, number, number] {
  const match = /^#?([\da-f]{6})$/i.exec(hex.trim())
  if (!match?.[1]) return [0, 0, 0]
  const int = Number.parseInt(match[1], 16)
  const srgb = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map(c => c / 255)
  return srgb.map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
}
