/**
 * Where a shot lives between sessions.
 *
 * The URL used to be rewritten on every change, which turned dragging a slider
 * into a stream of history entries and left the address bar unreadable. Local
 * storage is the working copy; a URL is produced only when someone asks for a
 * link, so it always means "here is a shot I chose to share" rather than
 * "whatever I happened to touch last".
 */

import { DEFAULT_SETTINGS, settingsFromQuery, settingsToQuery } from './settings'
import type { LabSettings } from './settings'
import { createComponentLayer, sanitizeLayers } from './layers'
import type { Layer } from './layers'
import { sanitizeEffects } from './effects'
import type { LayerEffect } from './effects'

const KEY = 'render-labs:settings'
/** Query key carrying the overlay layers in a share link. */
const LAYERS_PARAM = 'layers'
const CAMERA_PARAM = 'camera'
const MODE_PARAM = 'mode'

/**
 * What a document is for, and the one thing about it that cannot be changed by
 * dragging a slider.
 *
 * A shot is a single frame: no timeline, every layer simply present, and the
 * only export is a still. A video is a take over time. They share every other
 * part of the model — the same layers, the same camera, the same grade — which
 * is what makes switching between them lossless rather than a conversion.
 *
 * It lives on the document rather than in the settings because it is not a
 * property of how something is filmed. It decides which tool you are holding,
 * and the whole reason it exists is that opening the app used to drop you back
 * into whatever the last take was — usually a video, usually with a timeline
 * full of clips, when what you wanted was one picture.
 */
export const LAB_MODES = ['shot', 'video'] as const

export type LabMode = typeof LAB_MODES[number]

export interface LabDocument {
  mode: LabMode
  settings: LabSettings
  layers: Layer[]
  /** Camera moves over the take — a travelling is a dolly pointed at the shot. */
  camera: LayerEffect[]
}

/**
 * The document as a plain record, defaults omitted.
 *
 * One shape for three destinations — the working copy, a saved project and a
 * `.rlab` file — so a document written by any of them opens in the others, and
 * a field added to the settings starts round-tripping everywhere at once.
 */
export function serializeDocument(document: LabDocument): Record<string, unknown> {
  // Round-tripped through JSON rather than spread, because what arrives here is
  // the live document — Vue reactive proxies, not plain objects. Local storage
  // never minded: `JSON.stringify` reads straight through a proxy. IndexedDB
  // uses the structured clone algorithm, which refuses one outright and reports
  // it as "[object Object] could not be cloned", naming nothing useful.
  //
  // The cost is a parse over a few kilobytes. It was a parse over a document
  // carrying its own video until the media moved out, which is the only reason
  // this is the cheap fix rather than the expensive one.
  return JSON.parse(JSON.stringify({
    ...settingsToQuery(document.settings),
    [MODE_PARAM]: document.mode,
    [LAYERS_PARAM]: document.layers,
    [CAMERA_PARAM]: document.camera,
  })) as Record<string, unknown>
}

/**
 * And back, coercing as it goes.
 *
 * Unknown keys are dropped and out-of-range values clamped, so a record from an
 * older build — or from a project file somebody kept for a year — cannot hand
 * the renderer a value it no longer accepts.
 */
export function deserializeDocument(record: Record<string, unknown>): LabDocument {
  return {
    // Anything written before modes existed is a take on a timeline, because
    // that is all there was. Defaulting the other way would open every saved
    // project as a single frame and hide the clips it was made of.
    mode: record[MODE_PARAM] === 'shot' ? 'shot' : 'video',
    settings: settingsFromQuery(record),
    layers: withMigratedComponent(sanitizeLayers(record[LAYERS_PARAM]), record),
    camera: sanitizeEffects(record[CAMERA_PARAM]),
  }
}

export function loadStored(): LabDocument | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return deserializeDocument(parsed as Record<string, unknown>)
  } catch {
    // Private browsing, a quota error, corrupted JSON — a lost look is not
    // worth failing the page over.
    return null
  }
}

/**
 * Persist the working copy.
 *
 * Returns what went wrong rather than swallowing it: a save that fails in
 * silence means the next reload quietly discards an afternoon's work.
 *
 * Media used to be inlined here as data URLs, which put a real project past the
 * five megabyte cap on its first video. The bytes live in IndexedDB now and a
 * layer carries a reference, so what lands here is a few kilobytes of numbers
 * whatever the shot points at — the quota branch is kept for the pathological
 * document rather than for the ordinary one.
 */
export function saveStored(document: LabDocument): { ok: true } | { ok: false, reason: string } {
  try {
    localStorage.setItem(KEY, JSON.stringify(serializeDocument(document)))
    return { ok: true }
  } catch (cause) {
    const quota = cause instanceof DOMException
      && (cause.name === 'QuotaExceededError' || cause.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return {
      ok: false,
      reason: quota
        ? 'This shot is too large to keep as the working copy. Save it as a project, or remove a few layers.'
        : 'This project could not be saved to local storage.',
    }
  }
}

export function clearStored() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to recover from.
  }
}

/**
 * Carry a pre-unification document forward.
 *
 * The staged component used to live in the settings as a bare name, outside the
 * layer list. Anything saved back then would open with no animation at all, so
 * it is turned into the component layer it now is.
 */
function withMigratedComponent(layers: Layer[], record: Record<string, unknown>): Layer[] {
  if (layers.some(layer => layer.kind === 'component')) return layers
  const legacy = record.component
  if (typeof legacy !== 'string' || !legacy) return layers

  const length = Number(record.timelineLength)
  const span = Number.isFinite(length) ? length : DEFAULT_SETTINGS.timelineLength
  return [createComponentLayer(legacy, 0, span), ...layers]
}

function parseEffectsParam(value: unknown): LayerEffect[] {
  if (typeof value !== 'string' || !value) return []
  try {
    return sanitizeEffects(JSON.parse(value))
  } catch {
    return []
  }
}

function parseLayersParam(value: unknown): Layer[] {
  if (typeof value !== 'string' || !value) return []
  try {
    return sanitizeLayers(JSON.parse(value))
  } catch {
    return []
  }
}

/** A blank document of a given kind, which is what every "new" path starts from. */
export function createDocument(mode: LabMode): LabDocument {
  return { mode, settings: { ...DEFAULT_SETTINGS }, layers: [], camera: [] }
}

/**
 * Resolve the document a session should open with, or null to ask.
 *
 * A link wins over the working copy — following someone's URL has to show their
 * shot, not yours — and is then written to storage so a refresh keeps it.
 *
 * Null is the answer when there is neither: nothing has been made yet, and
 * there is no honest default. Opening straight into an empty video was the
 * quiet assumption that every session is a take, which is exactly what made
 * reaching for a single picture feel like undoing somebody else's work.
 */
export function resolveInitialDocument(query: Record<string, unknown>): (LabDocument & { fromLink: boolean }) | null {
  const fromLink = Object.keys(query).length > 0
  if (fromLink) {
    const document: LabDocument = {
      mode: query[MODE_PARAM] === 'shot' ? 'shot' : 'video',
      settings: settingsFromQuery(query),
      layers: withMigratedComponent(parseLayersParam(query[LAYERS_PARAM]), query),
      camera: parseEffectsParam(query[CAMERA_PARAM]),
    }
    saveStored(document)
    return { ...document, fromLink }
  }

  const stored = loadStored()
  return stored ? { ...stored, fromLink } : null
}

/**
 * Length past which a share link stops being usable.
 *
 * An inlined image is a data URL of its own, so a shot carrying one produces a
 * link no chat client will keep intact. Better to say so than to hand over a
 * URL that silently arrives truncated.
 */
export const MAX_SHARE_URL = 30_000

export function shareUrl(document: LabDocument): string {
  const params = new URLSearchParams(settingsToQuery(document.settings))
  if (document.layers.length) params.set(LAYERS_PARAM, JSON.stringify(document.layers))
  if (document.camera.length) params.set(CAMERA_PARAM, JSON.stringify(document.camera))
  const query = params.toString()
  return `${location.origin}${location.pathname}${query ? `?${query}` : ''}`
}
