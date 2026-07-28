/**
 * The lab's parameter set, its presets, and URL round-tripping.
 *
 * Every knob lives in one flat object so a shot is fully described by a URL —
 * paste it back and you get the exact same frame. That is what makes a take
 * reproducible a month later when the component has changed and the release
 * video needs a reshoot.
 */

export interface LabSettings {
  /** Stage size in CSS pixels, before any camera transform. */
  stageWidth: number
  stageHeight: number
  /** Supersampling of the rasterized plate. Higher costs capture time, buys sharpness. */
  plateScale: number
  /** Output frame size. */
  outputWidth: number
  outputHeight: number
  /** Frame rate of the export. */
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
}

export const DEFAULT_SETTINGS: LabSettings = {
  stageWidth: 1100,
  stageHeight: 720,
  plateScale: 2,
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
  plateScale: 'How densely the staged animation is rasterized. Raise it if text looks soft.',
  emission: 'Pushes the plate above full white so bloom has something to catch.',
  attenuation: 'Darkens the scene as it recedes, which reads as depth.',
  bloomThreshold: 'Brightness a pixel must reach before it glows.',
  bloomKnee: 'Softness of that threshold, so glow fades in instead of popping.',
  bloomRadius: 'How far the glow spreads.',
  aberration: 'Splits the colour channels towards the edges, the way a real lens does.',
  tail: 'Black held after the last clip ends, so a shot can land instead of cutting.',
  speed: 'Playback rate. Below 1 the animation is stepped in smaller increments — real slow motion.',
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

  plateScale: { min: 1, max: 4, step: 0.25, unit: '×' },
  stageWidth: { min: 320, max: 2400, step: 10, unit: 'px' },
  stageHeight: { min: 240, max: 1600, step: 10, unit: 'px' },
  // Low minimums on purpose: clamping an output size silently changes the
  // aspect ratio of a shot, which is worse than allowing a small frame.
  outputWidth: { min: 240, max: 3840, step: 2, unit: 'px' },
  outputHeight: { min: 240, max: 2160, step: 2, unit: 'px' },
  tail: { min: 0, max: 10000, step: 50, unit: 'ms' },
  fps: { min: 12, max: 60, step: 1, unit: 'fps' },
  speed: { min: 0.1, max: 2, step: 0.05, unit: '×' },
} as const satisfies Record<string, { min: number, max: number, step: number, unit?: string }>

export type RangedKey = keyof typeof RANGES

/**
 * Named looks.
 *
 * These are starting points, not a closed set — the point of the lab is to
 * drag sliders. `flat` exists so there is always a way back to a clean,
 * undistorted capture of a component.
 */
export const PRESETS: Record<string, Partial<LabSettings>> = {
  flat: {
    pitch: 0,
    yaw: 0,
    roll: 0,
    zoom: 1,
    fov: 32,
    focus: 0.5,
    focusRange: 0.35,
    aperture: 0,
    bloomIntensity: 0.2,
    vignette: 0.2,
    grain: 0.01,
    aberration: 0,
    attenuation: 0,
    emission: 1,
  },
  // The look from the reference frame: steep tilt, shallow focus, heavy falloff
  // into black, just enough bloom to make the blues bleed.
  cinematic: {
    pitch: 16,
    yaw: -21,
    roll: -8,
    zoom: 1.08,
    fov: 30,
    focus: 0.45,
    focusRange: 0.5,
    aperture: 0.9,
    blurRadius: 13,
    dofSamples: 48,
    bloomIntensity: 0.62,
    bloomThreshold: 0.62,
    bloomKnee: 0.4,
    bloomRadius: 1.4,
    emission: 1.35,
    exposure: 1.05,
    contrast: 1.08,
    saturation: 1.12,
    aberration: 0.22,
    vignette: 0.62,
    grain: 0.022,
    attenuation: 0.55,
  },
  // Straight-on but not flat: a hint of roll, wide open, strong glow. Reads well
  // cropped to a square for social.
  glow: {
    pitch: 4,
    yaw: -6,
    roll: -2,
    zoom: 1.02,
    fov: 34,
    focus: 0.5,
    focusRange: 0.7,
    aperture: 0.5,
    blurRadius: 10,
    bloomIntensity: 1.1,
    bloomThreshold: 0.5,
    bloomKnee: 0.5,
    bloomRadius: 1.8,
    emission: 1.5,
    exposure: 1.02,
    saturation: 1.18,
    aberration: 0.15,
    vignette: 0.45,
    grain: 0.018,
    attenuation: 0.2,
  },
  // Tilt-shift: a band of the plate is sharp and the rest falls away. Strong,
  // but the sharp band still has to carry readable content — pushed much past
  // this the frame stops being a shot of a component and becomes an abstract.
  macro: {
    pitch: 24,
    yaw: -26,
    roll: -10,
    zoom: 1.2,
    fov: 38,
    focus: 0.42,
    focusRange: 0.26,
    aperture: 1,
    blurRadius: 26,
    dofSamples: 64,
    bloomIntensity: 0.5,
    bloomThreshold: 0.7,
    bloomRadius: 1.6,
    emission: 1.3,
    exposure: 1.1,
    contrast: 1.12,
    aberration: 0.35,
    vignette: 0.6,
    grain: 0.025,
    attenuation: 0.4,
  },
}

/** Aspect presets for the output frame. */
export const FORMATS = [
  { label: '16:9', width: 1920, height: 1080 },
  { label: '1:1', width: 1080, height: 1080 },
  { label: '4:5', width: 1080, height: 1350 },
  { label: '9:16', width: 1080, height: 1920 },
  { label: '2:1', width: 1920, height: 960 },
] as const

const BOOLEAN_KEYS = ['tonemap'] as const
const STRING_KEYS = ['background', 'container'] as const

function clampRanged(key: string, value: number): number {
  const range = (RANGES as Record<string, { min: number, max: number } | undefined>)[key]
  if (!range) return value
  return Math.min(range.max, Math.max(range.min, value))
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

export function applyPreset(settings: LabSettings, name: string): LabSettings {
  const preset = PRESETS[name]
  if (!preset) return settings
  // Framing is the shot, not the look — a preset must not silently reframe what
  // is being filmed.
  return { ...settings, ...preset }
}

export function hexToLinearRgb(hex: string): [number, number, number] {
  const match = /^#?([\da-f]{6})$/i.exec(hex.trim())
  if (!match?.[1]) return [0, 0, 0]
  const int = Number.parseInt(match[1], 16)
  const srgb = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map(c => c / 255)
  return srgb.map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
}
