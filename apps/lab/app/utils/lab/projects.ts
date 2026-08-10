/**
 * Named projects, and the file one becomes.
 *
 * The working copy is still the thing being edited, and it is still in local
 * storage — synchronous, so a session opens on the shot it closed on without
 * waiting for a database. A project is a snapshot of that copy under a name:
 * saving writes one, opening replaces the working copy with one.
 *
 * Nothing here talks to a server. A project lives in this browser, and the way
 * it reaches another machine — or survives this one — is a file the person
 * downloads and keeps, which is also the only backup that does not depend on the
 * lab still existing.
 */

import { PROJECTS, all, get, put, remove } from './db'
import type { LabDocument, LabMode } from './storage'
import { deserializeDocument, serializeDocument } from './storage'
import { collectAssetIds, getAsset, pruneAssets, putAssetWithId } from './assets'
import { readArchive, writeArchive } from './project-file'

export const PROJECT_EXTENSION = 'rlab'
const FORMAT_VERSION = 1
const MANIFEST = 'project.json'
const MAX_NAME = 60

export interface ProjectSummary {
  id: string
  name: string
  /**
   * Whether this project is a still or a take.
   *
   * Kept on the summary rather than read out of the document, so a list can say
   * which of the two it is without deserializing every record it shows.
   */
  mode: LabMode
  savedAt: number
  /** Media the project points at, for the list to say what it costs. */
  bytes: number
  layers: number
  /**
   * The frame that was on screen when it was saved.
   *
   * A list of shots without pictures is a list of filenames, and the whole tool
   * exists because a filename does not tell you what a shot looks like. Stored
   * beside the record rather than as an asset: it is derived, it is a few
   * kilobytes, and it should die with the project rather than be swept.
   */
  poster?: Blob
}

interface ProjectRecord extends ProjectSummary {
  document: Record<string, unknown>
}

const POSTER = 'poster.webp'

interface AssetManifestEntry {
  id: string
  name: string
  type: string
}

function nextId(): string {
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Trimmed, collapsed and capped, and never empty.
 *
 * A project with a blank name is a row in the list with nothing to click on, and
 * one with a newline in it breaks the row it is drawn in.
 */
export function normalizeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
}

/** What a project weighs, which is what its media weighs. */
async function weigh(layers: LabDocument['layers']): Promise<number> {
  const ids = collectAssetIds(layers)
  const records = await Promise.all(ids.map(id => getAsset(id)))
  return records.reduce((total, record) => total + (record?.bytes ?? 0), 0)
}

export async function listProjects(): Promise<ProjectSummary[]> {
  try {
    const records = await all<ProjectRecord>(PROJECTS)
    return records
      .map(({ id, name, mode, savedAt, bytes, layers, poster }) => ({
        id,
        name,
        // Written before modes existed, so it is a take — the same reading
        // `deserializeDocument` takes of a record with no mode on it.
        mode: mode === 'shot' ? 'shot' : 'video',
        savedAt,
        bytes,
        layers,
        poster,
      }))
      .sort((a, b) => b.savedAt - a.savedAt)
  } catch {
    // No storage at all — private browsing, or a blocked upgrade. The lab still
    // works, it just cannot remember more than the working copy.
    return []
  }
}

/**
 * Write the working copy under a name.
 *
 * Passing an `id` overwrites that project; leaving it out makes a new one. The
 * assets are already in the database — a project references them rather than
 * copying them, so saving the same footage into three projects stores it once.
 */
export async function saveProject(
  name: string,
  document: LabDocument,
  id?: string,
  poster?: Blob,
): Promise<ProjectSummary> {
  // Keep the previous picture when a save could not produce one — a project that
  // loses its thumbnail on an overwrite looks like a different project.
  const previous = id ? await get<ProjectRecord>(PROJECTS, id) : undefined
  const summary: ProjectSummary = {
    id: id ?? nextId(),
    name: normalizeName(name) || 'Untitled',
    mode: document.mode,
    savedAt: Date.now(),
    bytes: await weigh(document.layers),
    layers: document.layers.length,
    poster: poster ?? previous?.poster,
  }
  await put<ProjectRecord>(PROJECTS, { ...summary, document: serializeDocument(document) })
  return summary
}

export async function openProject(id: string): Promise<LabDocument | null> {
  const record = await get<ProjectRecord>(PROJECTS, id)
  if (!record) return null
  return deserializeDocument(record.document)
}

export async function renameProject(id: string, name: string): Promise<ProjectSummary | null> {
  const record = await get<ProjectRecord>(PROJECTS, id)
  if (!record) return null
  const renamed = { ...record, name: normalizeName(name) || record.name }
  await put<ProjectRecord>(PROJECTS, renamed)
  const { document: _document, ...summary } = renamed
  return summary
}

export async function duplicateProject(id: string): Promise<ProjectSummary | null> {
  const record = await get<ProjectRecord>(PROJECTS, id)
  if (!record) return null
  const copy: ProjectRecord = {
    ...record,
    id: nextId(),
    name: normalizeName(`${record.name} copy`),
    savedAt: Date.now(),
  }
  await put<ProjectRecord>(PROJECTS, copy)
  const { document: _document, ...summary } = copy
  return summary
}

/**
 * Delete a project, then reclaim any media only it was using.
 *
 * The sweep runs over what everything else still references, so deleting the
 * project a clip came from frees the clip, and deleting one of two projects that
 * share it frees nothing.
 */
export async function deleteProject(id: string, alsoKeep: LabDocument): Promise<void> {
  await remove(PROJECTS, id)
  await sweepAssets(alsoKeep)
}

/**
 * Drop media nothing points at, across the saved projects and the working copy.
 *
 * Refuses to run at all if the library cannot be read. An empty list from a
 * failed read is indistinguishable from an empty library, and sweeping on that
 * would decide every saved project's footage was unreferenced and delete it —
 * the one operation here with no way back.
 */
export async function sweepAssets(working: LabDocument): Promise<number> {
  let records: ProjectRecord[]
  try {
    records = await all<ProjectRecord>(PROJECTS)
  } catch {
    return 0
  }

  const keep = new Set(collectAssetIds(working.layers))
  for (const record of records) {
    for (const assetId of collectAssetIds(deserializeDocument(record.document).layers)) keep.add(assetId)
  }
  return pruneAssets(keep)
}

/** The document and every byte it points at, as one file. */
export async function exportProject(name: string, document: LabDocument, poster?: Blob): Promise<Blob> {
  const ids = collectAssetIds(document.layers)
  const records = await Promise.all(ids.map(id => getAsset(id)))
  const present = records.filter((record): record is NonNullable<typeof record> => Boolean(record))

  const manifest: AssetManifestEntry[] = present.map(({ id, name: file, type }) => ({ id, name: file, type }))
  const payload = {
    version: FORMAT_VERSION,
    name: normalizeName(name) || 'Untitled',
    document: serializeDocument(document),
    assets: manifest,
  }

  const entries = [
    { path: MANIFEST, data: new TextEncoder().encode(JSON.stringify(payload, null, 2)) },
    ...await Promise.all(present.map(async record => ({
      path: `assets/${record.id}`,
      data: new Uint8Array(await record.blob.arrayBuffer()),
    }))),
  ]

  // Carried so a re-imported project arrives with its picture. Without it, the
  // one project that came from a file is the one blank tile in the list.
  if (poster) entries.push({ path: POSTER, data: new Uint8Array(await poster.arrayBuffer()) })

  return writeArchive(entries)
}

/**
 * Read a project file back, storing its media on the way.
 *
 * The assets are keyed by the hash they were exported under rather than
 * rehashed, so a file that arrives twice — or arrives holding a clip this
 * browser already has — does not store a second copy of it.
 */
export async function importProject(file: Blob): Promise<{ name: string, document: LabDocument, poster?: Blob }> {
  const files = await readArchive(file)
  const raw = files.get(MANIFEST)
  if (!raw) throw new Error('That file is not a lab project.')

  const payload = JSON.parse(new TextDecoder().decode(raw)) as {
    version?: number
    name?: string
    document?: Record<string, unknown>
    assets?: AssetManifestEntry[]
  }

  if (typeof payload.version === 'number' && payload.version > FORMAT_VERSION) {
    throw new Error('This project was made by a newer version of the lab.')
  }
  if (!payload.document || typeof payload.document !== 'object') {
    throw new Error('That project file has no document in it.')
  }

  for (const asset of payload.assets ?? []) {
    const bytes = files.get(`assets/${asset.id}`)
    // A missing asset is not a reason to refuse the whole project: the layers
    // that do resolve still open, and the ones that do not say so in the frame.
    if (!bytes) continue
    await putAssetWithId(asset.id, new Blob([bytes as BlobPart], { type: asset.type }), asset.name)
  }

  const poster = files.get(POSTER)

  return {
    name: normalizeName(payload.name ?? '') || 'Imported project',
    document: deserializeDocument(payload.document),
    poster: poster ? new Blob([poster as BlobPart], { type: 'image/webp' }) : undefined,
  }
}

export function projectFilename(name: string): string {
  const stem = normalizeName(name).replace(/[^\w -]/g, '').replace(/\s+/g, '-') || 'project'
  return `${stem}.${PROJECT_EXTENSION}`
}
