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

const KEY = 'evlog-lab:settings'
/** Query key carrying the overlay layers in a share link. */
const LAYERS_PARAM = 'layers'
const CAMERA_PARAM = 'camera'

export interface LabDocument {
  settings: LabSettings
  layers: Layer[]
  /** Camera moves over the take — a travelling is a dolly pointed at the shot. */
  camera: LayerEffect[]
}

export function loadStored(): LabDocument | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    // Same coercion as the URL path: unknown keys are dropped and out-of-range
    // values are clamped, so a stale entry from an older build cannot poison
    // the renderer with a value it no longer accepts.
    return {
      settings: settingsFromQuery(record),
      layers: withMigratedComponent(sanitizeLayers(record[LAYERS_PARAM]), record),
      camera: sanitizeEffects(record[CAMERA_PARAM]),
    }
  } catch {
    // Private browsing, a quota error, corrupted JSON — a lost look is not
    // worth failing the page over.
    return null
  }
}

/**
 * Persist the working copy.
 *
 * Returns what went wrong rather than swallowing it. Local storage caps around
 * five megabytes and an imported video is inlined as a data URL, so a real
 * project reaches the limit easily — and a save that fails in silence means the
 * next reload quietly discards an afternoon's work.
 */
export function saveStored(document: LabDocument): { ok: true } | { ok: false, reason: string } {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      ...settingsToQuery(document.settings),
      [LAYERS_PARAM]: document.layers,
      [CAMERA_PARAM]: document.camera,
    }))
    return { ok: true }
  } catch (cause) {
    const quota = cause instanceof DOMException
      && (cause.name === 'QuotaExceededError' || cause.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    return {
      ok: false,
      reason: quota
        ? 'This project is too large to save — imported media is stored inside it. Remove a video or an image, or export what you have now.'
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

/**
 * Resolve the document a session should open with.
 *
 * A link wins over the working copy — following someone's URL has to show their
 * shot, not yours — and is then written to storage so a refresh keeps it.
 */
export function resolveInitialDocument(query: Record<string, unknown>): LabDocument & { fromLink: boolean } {
  const fromLink = Object.keys(query).length > 0
  if (fromLink) {
    const document: LabDocument = {
      settings: settingsFromQuery(query),
      layers: withMigratedComponent(parseLayersParam(query[LAYERS_PARAM]), query),
      camera: parseEffectsParam(query[CAMERA_PARAM]),
    }
    saveStored(document)
    return { ...document, fromLink }
  }
  const stored = loadStored()
  return {
    settings: stored?.settings ?? { ...DEFAULT_SETTINGS },
    layers: stored?.layers ?? [],
    camera: stored?.camera ?? [],
    fromLink,
  }
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
