/**
 * Imported media, stored once and referred to by what it is.
 *
 * A layer used to carry its file inline as a data URL. That made a document
 * self-contained, and made it enormous: base64 is a third bigger than the bytes
 * it encodes, local storage caps around five megabytes, a share link caps far
 * below that, and every undo snapshot had to reckon with the whole thing. The
 * same clip used twice was stored twice.
 *
 * Now a layer holds `asset:<hash>` and the bytes live in IndexedDB under that
 * hash. Two imports of the same file resolve to one record, a document is a few
 * kilobytes whatever it points at, and the bytes are handed to the decoder as a
 * `Blob` — which is also what a video element wants, so seeking got cheaper on
 * the way past.
 *
 * Old documents keep working untouched: `resolveSrc` returns anything that is
 * not an asset reference exactly as it found it, so a data URL saved last month
 * still draws.
 */

import { ASSETS, get, put, remove, request } from './db'
import type { Layer } from './layers'

const PREFIX = 'asset:'

export interface AssetRecord {
  id: string
  blob: Blob
  /** Original file name, kept so an exported project restores something readable. */
  name: string
  type: string
  bytes: number
}

export function isAssetRef(src: string | undefined): src is string {
  return typeof src === 'string' && src.startsWith(PREFIX)
}

export function assetId(src: string): string {
  return src.slice(PREFIX.length)
}

export function assetRef(id: string): string {
  return `${PREFIX}${id}`
}

/**
 * Content address, as the first half of a SHA-256.
 *
 * Halved because the full digest is 64 characters in a document that is read by
 * people, and 128 bits is past the point where a collision is a thing anyone has
 * to plan for. `crypto.subtle` rather than a hand-rolled hash: it is the same
 * primitive the rest of the project signs with, and it is the one the platform
 * has already optimised.
 */
async function hash(buffer: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

/**
 * Object URLs, one per asset for the life of the session.
 *
 * Minted lazily and never revoked while the document might still point at them:
 * a texture holds its image, a video element holds its source, and revoking
 * under either turns the layer black on the next upload. They cost a pointer
 * each, and the tab reclaims them all when it closes.
 */
const urls = new Map<string, string>()

/** Store a file and return the reference a layer should carry. */
export async function putAsset(file: File | Blob, name: string): Promise<string> {
  const buffer = await file.arrayBuffer()
  const id = await hash(buffer)

  // Written only when it is new. Re-importing the same file is common — the
  // same logo on three shots — and rewriting the blob would be work with no
  // outcome, on the largest records in the database.
  const existing = await get<AssetRecord>(ASSETS, id)
  if (!existing) {
    await put<AssetRecord>(ASSETS, { id, blob: file, name, type: file.type, bytes: file.size })
  }

  return assetRef(id)
}

/** Store a blob that already knows its id, for a project arriving from a file. */
export async function putAssetWithId(id: string, blob: Blob, name: string): Promise<void> {
  const existing = await get<AssetRecord>(ASSETS, id)
  if (existing) return
  await put<AssetRecord>(ASSETS, { id, blob, name, type: blob.type, bytes: blob.size })
}

export function getAsset(id: string): Promise<AssetRecord | undefined> {
  return get<AssetRecord>(ASSETS, id)
}

/**
 * Turn whatever a layer carries into something a decoder can open.
 *
 * Returns `null` only for a reference with nothing behind it — a project opened
 * on a machine that never received its media, which the caller reports rather
 * than drawing a stale picture.
 */
export async function resolveSrc(src: string | undefined): Promise<string | null> {
  if (!src) return null
  if (!isAssetRef(src)) return src

  const id = assetId(src)
  const cached = urls.get(id)
  if (cached) return cached

  const record = await getAsset(id)
  if (!record) return null

  const url = URL.createObjectURL(record.blob)
  urls.set(id, url)
  return url
}

/** Every asset a set of layers depends on. */
export function collectAssetIds(layers: Layer[]): string[] {
  const ids = new Set<string>()
  for (const layer of layers) {
    if (isAssetRef(layer.src)) ids.add(assetId(layer.src))
  }
  return [...ids]
}

/**
 * Drop assets nothing points at any more.
 *
 * Called with everything every saved project and the working copy still use, so
 * deleting a project reclaims its footage and keeping a second project that
 * shares a clip does not. Failures are swallowed: leaving an orphan behind costs
 * disk, and failing a save over one costs work.
 */
export async function pruneAssets(keep: Iterable<string>): Promise<number> {
  const wanted = new Set(keep)
  try {
    const ids = await request<string[]>(ASSETS, 'readonly', store => store.getAllKeys() as IDBRequest<string[]>)
    const orphans = ids.filter(id => !wanted.has(id))
    for (const id of orphans) {
      await remove(ASSETS, id)
      const url = urls.get(id)
      if (url) {
        URL.revokeObjectURL(url)
        urls.delete(id)
      }
    }
    return orphans.length
  } catch {
    return 0
  }
}
