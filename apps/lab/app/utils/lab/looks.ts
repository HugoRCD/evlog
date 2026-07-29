/**
 * Looks: a framing and a grade, as something you can dose, keep and send.
 *
 * A look does set the tilt, the lens angle and the framing — that is most of
 * what makes one look like anything. What it does *not* do is store a zoom.
 *
 * That distinction is the whole design. The old presets wrote `zoom: 1.2`
 * alongside `pitch: 24, yaw: -26`, and a zoom is only ever correct for one
 * combination of plate shape and output shape: rotating a plate grows its
 * projected outline by an amount that depends on the angles *and* on its own
 * aspect, so the same numbers that framed a wide text panel sliced the corners
 * off a tall image. Here a look states an intent — "a 3/4 angle that fills the
 * frame", "a push-in that crops 35% past the edges" — and the zoom is solved
 * against the stage and output aspects actually in play. Change format, fit the
 * stage to a short animation, drop in a square image: the look re-solves and
 * stays framed.
 *
 * `focus` is stored, and that is safe for the same kind of reason: the renderer
 * measures the plate's real depth span under the current rotation and treats
 * `focus` as a position across it, so 0.45 means the same place on any content.
 *
 * A look is also not a jump to a fixed point. `amount` interpolates every input
 * from neutral, tilt included, and past it. That is the difference between a look
 * that happens to suit one clip and one you can dial into whatever is staged.
 */

import { RANGES, snapToRange } from './settings'
import type { LabSettings } from './settings'
import { frameCoverage, zoomToFill } from './renderer'
import type { Framing } from './renderer'

/** Where the camera is put. Absolute — an angle means the same on any content. */
export const FRAME_KEYS = ['pitch', 'yaw', 'roll', 'fov', 'panX', 'panY'] as const

/** The lens and the grade. */
export const GRADE_KEYS = [
  'focus',
  'focusRange',
  'aperture',
  'blurRadius',
  'dofSamples',

  'bloomIntensity',
  'bloomThreshold',
  'bloomKnee',
  'bloomRadius',

  'emission',
  'exposure',
  'contrast',
  'saturation',
  'tonemap',
  'aberration',
  'vignette',
  'grain',
  'attenuation',
] as const

/**
 * Everything a look writes into the settings.
 *
 * `zoom` is in here because it does get written — it is just never authored.
 * Stage and output sizes are not: a look describes how something is shot, not
 * what is being shot or how large it comes out.
 */
export const LOOK_KEYS = [...FRAME_KEYS, 'zoom', ...GRADE_KEYS] as const satisfies readonly (keyof LabSettings)[]

export type FrameKey = typeof FRAME_KEYS[number]
export type GradeKey = typeof GRADE_KEYS[number]
export type LookKey = typeof LOOK_KEYS[number]

/**
 * A look as authored: angles, grade, and a coverage target in place of a zoom.
 *
 * `fill` is the fraction of the frame the tilted plate should cover. 1 puts a
 * corner exactly on an edge, below 1 leaves air, above 1 crops — which is what a
 * push-in is, stated as an intent rather than as a number that happened to work.
 */
export type LookDef = Pick<LabSettings, FrameKey | GradeKey> & { fill: number }

/** What a look resolves to: the same keys, with the zoom solved. */
export type ResolvedLook = Pick<LabSettings, LookKey>

export const MIN_FILL = 0.5
export const MAX_FILL = 2

/**
 * A straight, edge-to-edge capture with nothing graded.
 *
 * This is what `amount` interpolates *from*, which is why it is a real zero
 * rather than the app's defaults — those carry a mild grade already, and
 * blending from them would leave a look at 0% still glowing.
 */
export const NEUTRAL_LOOK: LookDef = {
  pitch: 0,
  yaw: 0,
  roll: 0,
  fov: 32,
  panX: 0,
  panY: 0,
  fill: 1,

  focus: 0.5,
  focusRange: 1,
  aperture: 0,
  blurRadius: 12,
  dofSamples: 32,

  bloomIntensity: 0,
  bloomThreshold: 0.75,
  bloomKnee: 0.35,
  bloomRadius: 1,

  emission: 1,
  exposure: 1,
  contrast: 1,
  saturation: 1,
  tonemap: true,
  aberration: 0,
  vignette: 0,
  grain: 0,
  attenuation: 0,
}

/** A look is its distance from neutral, which is also the only part worth reading. */
function defineLook(diff: Partial<LookDef>): LookDef {
  return { ...NEUTRAL_LOOK, ...diff }
}

export interface LookEntry {
  name: string
  /** One line, shown under the picker — what it is for, not what it sets. */
  note: string
  look: LookDef
}

/**
 * The built-in set.
 *
 * Names are things you can picture. An earlier pass had one called `anamorphic`,
 * which describes a lens nobody here owns and told you nothing about what would
 * happen — a preset you cannot predict is a preset you click twice and abandon.
 */
export const BUILT_IN_LOOKS: LookEntry[] = [
  {
    name: 'flat',
    note: 'Square on, edge to edge, everything sharp. The way back.',
    look: defineLook({}),
  },
  {
    name: 'cinematic',
    note: 'The 3/4 hero angle: tilted, shallow, graded warm and dark at the edges.',
    look: defineLook({
      pitch: 16,
      yaw: -21,
      roll: -8,
      fov: 30,
      fill: 0.98,
      focus: 0.45,
      focusRange: 0.5,
      aperture: 0.9,
      blurRadius: 13,
      dofSamples: 48,
      bloomIntensity: 0.55,
      // Low thresholds throughout: these plates are dark UI, and their brightest
      // pixels are the type. A 0.62 threshold caught almost nothing, so the glow
      // came from `emission` lifting the whole picture instead — including the
      // near-black background, which is what turned shots into a grey slab.
      bloomThreshold: 0.35,
      bloomKnee: 0.2,
      bloomRadius: 1.4,
      emission: 1.05,
      exposure: 1,
      contrast: 1.12,
      saturation: 1.1,
      aberration: 0.18,
      vignette: 0.5,
      grain: 0.022,
      attenuation: 0.3,
    }),
  },
  {
    name: 'tilt',
    note: 'A firm lean with the whole plate still in frame. The safe one for any content.',
    look: defineLook({
      pitch: 22,
      yaw: -14,
      roll: -4,
      fov: 34,
      fill: 1,
      focus: 0.5,
      focusRange: 0.45,
      aperture: 0.7,
      blurRadius: 14,
      dofSamples: 48,
      bloomIntensity: 0.4,
      bloomThreshold: 0.4,
      bloomRadius: 1.25,
      emission: 1,
      exposure: 1,
      contrast: 1.06,
      saturation: 1.05,
      aberration: 0.1,
      vignette: 0.35,
      grain: 0.016,
      attenuation: 0.18,
    }),
  },
  {
    name: 'macro',
    note: 'Pushed in past the edges, one thin band sharp. Aim it with the crosshair.',
    look: defineLook({
      pitch: 26,
      yaw: -28,
      roll: -10,
      fov: 40,
      // Deliberately over 1: cropping is the point of a push-in, and stating it
      // as coverage means it crops by the same amount on any plate shape.
      fill: 1.35,
      focus: 0.42,
      focusRange: 0.22,
      aperture: 1.1,
      blurRadius: 28,
      dofSamples: 64,
      bloomIntensity: 0.45,
      bloomThreshold: 0.38,
      bloomRadius: 1.5,
      emission: 1.05,
      exposure: 1.02,
      contrast: 1.1,
      saturation: 1.05,
      aberration: 0.28,
      vignette: 0.45,
      grain: 0.025,
      attenuation: 0.25,
    }),
  },
  {
    name: 'top down',
    note: 'Looking down at the plate from above, no sideways lean.',
    look: defineLook({
      pitch: 42,
      fov: 36,
      fill: 1.02,
      focus: 0.5,
      focusRange: 0.4,
      aperture: 0.8,
      blurRadius: 18,
      dofSamples: 48,
      bloomIntensity: 0.35,
      bloomThreshold: 0.42,
      bloomRadius: 1.25,
      emission: 1,
      exposure: 1,
      contrast: 1.06,
      vignette: 0.4,
      grain: 0.018,
      attenuation: 0.25,
    }),
  },
  {
    name: 'neon',
    note: 'Nearly square on, and glowing hard. The docs’ own language.',
    look: defineLook({
      pitch: 5,
      yaw: -7,
      roll: -2,
      fov: 34,
      fill: 0.96,
      focusRange: 0.8,
      aperture: 0.35,
      blurRadius: 10,
      bloomIntensity: 0.95,
      bloomThreshold: 0.25,
      // Under the threshold, always. The prefilter's soft knee reaches down from
      // the threshold by this much, so a knee wider than the threshold hands a
      // bloom multiplier to near-black pixels — at 0.5 against a 0.25 threshold
      // the background picked up a 3.4x gain and the frame came out grey.
      bloomKnee: 0.15,
      bloomRadius: 1.9,
      // Held near 1. At 1.5 this multiplied the plate's own near-black
      // background by half again, and the glow arrived as a lifted grey field
      // rather than as light coming off the type.
      emission: 1.12,
      exposure: 1,
      contrast: 1.04,
      saturation: 1.2,
      aberration: 0.14,
      vignette: 0.35,
      grain: 0.016,
      attenuation: 0.12,
    }),
  },
  {
    name: 'noir',
    note: 'Actually black and white. Hard contrast, closed corners, heavy grain.',
    look: defineLook({
      pitch: 12,
      yaw: -16,
      roll: -3,
      fov: 30,
      fill: 1,
      focus: 0.48,
      focusRange: 0.55,
      aperture: 0.6,
      blurRadius: 14,
      dofSamples: 48,
      bloomIntensity: 0.25,
      bloomThreshold: 0.45,
      bloomRadius: 1.2,
      emission: 1,
      exposure: 0.98,
      contrast: 1.28,
      // Zero, not "nearly". An earlier pass left this at 0.15, which reads as a
      // colour picture someone forgot to finish desaturating.
      saturation: 0,
      vignette: 0.6,
      grain: 0.04,
      attenuation: 0.35,
    }),
  },
  {
    name: 'print',
    note: 'For stills: square on with a margin, contrasty, grainy, no glow to smear type.',
    look: defineLook({
      fill: 0.92,
      // The one look with the tonemap off. ACES is built for scene-linear HDR;
      // fed display-referred UI it lifts the midtones and flattens the top end,
      // which is the opposite of what a faithful still wants.
      tonemap: false,
      exposure: 1.02,
      contrast: 1.15,
      saturation: 0.95,
      vignette: 0.2,
      grain: 0.028,
    }),
  },
]

/**
 * How far past a look `amount` can be pushed.
 *
 * Extrapolation is the useful half of the dial: a look authored to read on a
 * dense panel is often halfway to nothing on a sparse one, and the answer is to
 * push it rather than to author a second copy. Every value is still snapped into
 * its own range afterwards, so overshooting cannot produce something the
 * renderer will refuse.
 *
 * Read off the control's own range rather than restated, so the dial and the
 * blend cannot disagree about where the ceiling is.
 */
export const MAX_LOOK_AMOUNT = RANGES.lookAmount.max

export function clampLookAmount(amount: number): number {
  return Number.isFinite(amount) ? Math.min(MAX_LOOK_AMOUNT, Math.max(0, amount)) : 1
}

const DEF_KEYS = [...FRAME_KEYS, ...GRADE_KEYS] as const

/**
 * The only keys `amount` may push past what the look was authored at.
 *
 * Everything else stops at its authored value. The distinction is what "more"
 * can mean: a wider bokeh or a stronger glow is more of the same look, whereas
 * more lean, more falloff, or a thinner sharp band is a different and usually
 * unusable shot. Extrapolating the lot took a 22° tilt to 32°, drove a focal
 * band from 0.45 down to 0.16, and pushed vignette and attenuation to where the
 * frame went black — the dial destroyed exactly the looks it was meant to refine.
 */
const PUSHABLE = new Set<keyof LookDef>([
  'bloomIntensity',
  'bloomRadius',
  'aperture',
  'blurRadius',
  'grain',
  'aberration',
])

/**
 * A look at a given strength, still unresolved.
 *
 * Every input is dialled, the angles included — so half a look is half the tilt
 * as well as half the glow, and the dial visibly does something. Booleans switch
 * at the halfway mark rather than interpolating: there is no 40% of a tonemap.
 */
export function blendLook(look: LookDef, amount: number): LookDef {
  const t = clampLookAmount(amount)
  const blended = { fill: 0 } as Record<keyof LookDef, number | boolean>

  for (const key of DEF_KEYS) {
    const from = NEUTRAL_LOOK[key]
    const to = look[key]

    if (typeof from === 'boolean' || typeof to === 'boolean') {
      blended[key] = t >= 0.5 ? to : from
      continue
    }
    const local = PUSHABLE.has(key) ? t : Math.min(1, t)
    blended[key] = snapToRange(key, from + (to - from) * local)
  }

  // `fill` is not a control, so it has no range table entry — clamped by hand to
  // the span the solver can actually bracket. Never pushed: cropping further
  // than a look asked for is a different shot, not a stronger one.
  const fill = NEUTRAL_LOOK.fill + (look.fill - NEUTRAL_LOOK.fill) * Math.min(1, t)
  blended.fill = Math.min(MAX_FILL, Math.max(MIN_FILL, fill))

  return blended as LookDef
}

/**
 * Turn an authored look into settings values for the shot in hand.
 *
 * The only computed part is the zoom, and it needs the two aspects the look
 * knows nothing about: the stage's, and the output frame's.
 */
export function resolveLook(look: LookDef, settings: LabSettings): ResolvedLook {
  const resolved = {} as Record<LookKey, number | boolean>
  for (const key of DEF_KEYS) resolved[key] = look[key]

  resolved.zoom = snapToRange('zoom', zoomToFill(framingOf(look, settings), look.fill))
  return resolved as ResolvedLook
}

/**
 * The angles from the look, the two aspects from the shot.
 *
 * Split that way because it is the whole point: a look owns how the camera is
 * turned, and the shot owns the shape of what is in front of it and of the frame
 * it lands in. The zoom is the one value that needs both.
 */
function framingOf(look: Pick<LookDef, FrameKey>, settings: LabSettings): Framing {
  return {
    fov: look.fov,
    pitch: look.pitch,
    yaw: look.yaw,
    roll: look.roll,
    panX: look.panX,
    panY: look.panY,
    outputAspect: settings.outputWidth / Math.max(settings.outputHeight, 1),
    sourceAspect: settings.stageWidth / Math.max(settings.stageHeight, 1),
  }
}

/** The look currently in force, read back as an authored one. */
export function readLook(settings: LabSettings): LookDef {
  const look = { fill: 1 } as Record<keyof LookDef, number | boolean>
  for (const key of DEF_KEYS) look[key] = settings[key]

  // The authored quantity is coverage, not zoom, so reading a look back has to
  // ask what coverage the current zoom amounts to. Saving the zoom instead would
  // reintroduce exactly the number that cannot travel between shots.
  look.fill = Math.min(MAX_FILL, Math.max(MIN_FILL, coverageOf(settings)))
  return look as LookDef
}

/** What fraction of the frame the plate covers as currently framed. */
export function coverageOf(settings: LabSettings): number {
  const coverage = frameCoverage(framingOf(settings, settings), settings.zoom)
  // A framing whose corners have gone behind the camera reports as infinite;
  // saving that would produce a look no solver can bracket.
  return Number.isFinite(coverage) ? coverage : 1
}

/**
 * Write a look into the settings.
 *
 * Takes the entry rather than a name on purpose: a look arriving from a link is
 * in neither the built-in list nor local storage, and a name-based signature
 * would quietly do nothing for exactly the case sharing exists to serve.
 *
 * The name and the amount are stored alongside the values so the dial can
 * re-blend from the same origin on every drag. Blending from whatever is
 * currently in the settings would compound: each nudge would re-grade an
 * already-graded frame and re-tilt an already-tilted plate.
 */
export function applyLookEntry(settings: LabSettings, entry: LookEntry, amount: number): LabSettings {
  // Clamped once, then used for both the blend and the stored amount. Storing the
  // raw value while blending a clamped one would leave the two disagreeing, and
  // `isLookModified` would report an edit nobody made.
  const t = clampLookAmount(amount)
  const resolved = resolveLook(blendLook(entry.look, t), settings)
  return { ...settings, ...resolved, look: entry.name, lookAmount: t }
}

/**
 * Has the look been edited by hand since it was picked?
 *
 * Worth surfacing: a panel that keeps a chip lit while the values under it have
 * moved on is claiming something untrue, and the next person to drag the amount
 * dial loses edits they had no reason to think were at risk.
 */
export function isLookModified(settings: LabSettings, userLooks: LookEntry[] = []): boolean {
  const entry = findLook(settings.look, userLooks)
  if (!entry) return false

  const expected = resolveLook(blendLook(entry.look, settings.lookAmount), settings)
  return LOOK_KEYS.some(key => expected[key] !== settings[key])
}

export function findLook(name: string, userLooks: LookEntry[] = []): LookEntry | null {
  if (!name) return null
  return [...BUILT_IN_LOOKS, ...userLooks].find(entry => entry.name === name) ?? null
}

export function isBuiltIn(name: string): boolean {
  return BUILT_IN_LOOKS.some(entry => entry.name === name)
}

// --- User looks -------------------------------------------------------------

const LOOKS_KEY = 'render-labs:looks'

/** Long enough to be descriptive, short enough to fit a chip. */
export const MAX_LOOK_NAME = 24

/**
 * Coerce anything read back from storage or a link.
 *
 * Same posture as the settings themselves: unknown keys are dropped and every
 * value is snapped into range, so a look saved by an older build cannot hand the
 * renderer a number it no longer accepts.
 */
function sanitizeLook(value: unknown): LookDef | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const look = { ...NEUTRAL_LOOK } as Record<keyof LookDef, number | boolean>

  for (const key of DEF_KEYS) {
    const raw = record[key]
    if (raw === undefined || raw === null) continue

    if (typeof NEUTRAL_LOOK[key] === 'boolean') {
      look[key] = raw === true || raw === 1 || raw === '1' || raw === 'true'
      continue
    }
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) look[key] = snapToRange(key, parsed)
  }

  const fill = Number(record.fill)
  if (Number.isFinite(fill)) look.fill = Math.min(MAX_FILL, Math.max(MIN_FILL, fill))

  return look as LookDef
}

export function normalizeLookName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_LOOK_NAME)
}

export function loadUserLooks(): LookEntry[] {
  try {
    const raw = localStorage.getItem(LOOKS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const entries: LookEntry[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const name = normalizeLookName(String(record.name ?? ''))
      const look = sanitizeLook(record.look)
      // A built-in name would shadow the original and leave no way back to it.
      if (!name || !look || isBuiltIn(name)) continue
      if (entries.some(entry => entry.name === name)) continue
      entries.push({ name, note: 'Saved from a shot of your own.', look })
    }
    return entries
  } catch {
    // Private browsing, corrupted JSON — a lost look is not worth a blank page.
    return []
  }
}

function writeUserLooks(entries: LookEntry[]): boolean {
  try {
    localStorage.setItem(LOOKS_KEY, JSON.stringify(entries.map(({ name, look }) => ({ name, look }))))
    return true
  } catch {
    return false
  }
}

/**
 * Save under a name, replacing any user look already using it.
 *
 * Kept separate from the document: a look is how you like things to look, not
 * part of any one shot, and it has to outlive the composition it was found on.
 */
export function saveUserLook(name: string, look: LookDef): { ok: true, entries: LookEntry[] } | { ok: false, reason: string } {
  const clean = normalizeLookName(name)
  if (!clean) return { ok: false, reason: 'Give the look a name.' }
  if (isBuiltIn(clean)) return { ok: false, reason: `“${clean}” is a built-in look — pick another name.` }

  const entries = loadUserLooks().filter(entry => entry.name !== clean)
  entries.push({ name: clean, note: 'Saved from a shot of your own.', look })
  entries.sort((a, b) => a.name.localeCompare(b.name))

  if (!writeUserLooks(entries)) return { ok: false, reason: 'This look could not be saved to local storage.' }
  return { ok: true, entries }
}

export function deleteUserLook(name: string): LookEntry[] {
  const entries = loadUserLooks().filter(entry => entry.name !== name)
  writeUserLooks(entries)
  return entries
}

// --- Sharing ----------------------------------------------------------------

/** Query key carrying a look on its own, without the shot it was found on. */
export const LOOK_PARAM = 'look'

function toBase64Url(text: string): string {
  // Encoded to bytes first: `btoa` throws on anything above Latin-1, and a look
  // name is free text.
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(token: string): string {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Encode a look as a token, carrying only its distance from neutral.
 *
 * The diff rather than the whole thing: it keeps the token short, and it means a
 * key added to `LookDef` later arrives at its neutral value on an old token
 * instead of being absent and undefined.
 */
export function encodeLook(name: string, look: LookDef): string {
  const diff: Record<string, number | boolean> = {}
  for (const key of DEF_KEYS) {
    if (look[key] !== NEUTRAL_LOOK[key]) diff[key] = look[key]
  }
  if (look.fill !== NEUTRAL_LOOK.fill) diff.fill = look.fill
  return toBase64Url(JSON.stringify({ n: normalizeLookName(name), v: diff }))
}

export function decodeLook(token: string): LookEntry | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(token.trim()))
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const look = sanitizeLook(record.v)
    if (!look) return null
    const name = normalizeLookName(String(record.n ?? '')) || 'shared look'
    return { name, note: 'Came in from a link.', look }
  } catch {
    return null
  }
}

/**
 * A link that carries the look alone.
 *
 * Deliberately not the document's share URL: sending someone a grade you like
 * should not also send them your composition, and receiving one should not
 * replace theirs.
 */
export function lookShareUrl(name: string, look: LookDef): string {
  return `${location.origin}${location.pathname}?${LOOK_PARAM}=${encodeLook(name, look)}`
}

/** Accepts a full share URL or a bare token, since people paste both. */
export function parseLookInput(input: string): LookEntry | null {
  const text = input.trim()
  if (!text) return null

  try {
    const url = new URL(text)
    const token = url.searchParams.get(LOOK_PARAM)
    if (token) return decodeLook(token)
  } catch {
    // Not a URL, so treat it as the token itself.
  }
  return decodeLook(text)
}
