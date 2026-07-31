/**
 * A project on disk: `project.json` and its media, in a zip.
 *
 * Written by hand and stored uncompressed, for the same reason the two muxers
 * are: the format is a few dozen bytes of header and the alternative is a
 * dependency. Nothing here would compress anyway — a `.rlab` is one small JSON
 * document beside footage that is already h.264 or a PNG, and deflating those
 * spends time to make them fractionally larger.
 *
 * A zip rather than one JSON with the media base64'd inside it, because that is
 * what a document carrying its bytes inline already cost the lab once: a third
 * more size, and a `JSON.parse` over a hundred megabytes of string to open a
 * project.
 */

const LOCAL_SIGNATURE = 0x04034B50
const CENTRAL_SIGNATURE = 0x02014B50
const EOCD_SIGNATURE = 0x06054B50
const EOCD_SIZE = 22
/** Store, not deflate. */
const STORED = 0

export interface ArchiveEntry {
  path: string
  data: Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

/** Local time, in the two packed 16-bit fields MS-DOS used and zip inherited. */
function dosStamp(when: Date): { time: number, date: number } {
  return {
    // Seconds have one bit less than they need, so they go in twos. Every zip
    // writer since 1989 has rounded here.
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  }
}

export function writeArchive(entries: ArchiveEntry[]): Blob {
  const encoder = new TextEncoder()
  const stamp = dosStamp(new Date())
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.path)
    const crc = crc32(entry.data)

    if (entry.data.length > 0xFFFFFFFF) {
      throw new Error(`${entry.path} is too large for a project file.`)
    }

    const local = new Uint8Array(30 + name.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, LOCAL_SIGNATURE, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0, true)
    localView.setUint16(8, STORED, true)
    localView.setUint16(10, stamp.time, true)
    localView.setUint16(12, stamp.date, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, entry.data.length, true)
    localView.setUint32(22, entry.data.length, true)
    localView.setUint16(26, name.length, true)
    localView.setUint16(28, 0, true)
    local.set(name, 30)

    const header = new Uint8Array(46 + name.length)
    const headerView = new DataView(header.buffer)
    headerView.setUint32(0, CENTRAL_SIGNATURE, true)
    headerView.setUint16(4, 20, true)
    headerView.setUint16(6, 20, true)
    headerView.setUint16(8, 0, true)
    headerView.setUint16(10, STORED, true)
    headerView.setUint16(12, stamp.time, true)
    headerView.setUint16(14, stamp.date, true)
    headerView.setUint32(16, crc, true)
    headerView.setUint32(20, entry.data.length, true)
    headerView.setUint32(24, entry.data.length, true)
    headerView.setUint16(28, name.length, true)
    headerView.setUint32(42, offset, true)
    header.set(name, 46)

    parts.push(local, entry.data)
    central.push(header)
    offset += local.length + entry.data.length
  }

  const directory = central.reduce((total, header) => total + header.length, 0)
  const end = new Uint8Array(EOCD_SIZE)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, EOCD_SIGNATURE, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, directory, true)
  endView.setUint32(16, offset, true)

  return new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/zip' })
}

export async function readArchive(file: Blob): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const decoder = new TextDecoder()

  // Scanned backwards because the end record carries a comment of any length
  // after it, so its position is not fixed. The comment is capped at 64 KB,
  // which is as far back as this has to look.
  let eocd = -1
  const floor = Math.max(0, bytes.length - EOCD_SIZE - 0xFFFF)
  for (let index = bytes.length - EOCD_SIZE; index >= floor; index--) {
    if (view.getUint32(index, true) === EOCD_SIGNATURE) {
      eocd = index
      break
    }
  }
  if (eocd < 0) throw new Error('That file is not a project — no zip directory in it.')

  const count = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)
  const files = new Map<string, Uint8Array>()

  for (let index = 0; index < count; index++) {
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) throw new Error('This project file is damaged.')

    const method = view.getUint16(cursor + 10, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const path = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))

    if (method !== STORED) {
      throw new Error(`${path} is compressed; the lab only writes and reads uncompressed project files.`)
    }

    // The local header repeats the name and carries its own extra field, which
    // need not match the one in the directory — so the data offset is computed
    // from the local header rather than assumed.
    const localName = view.getUint16(localOffset + 26, true)
    const localExtra = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + localName + localExtra
    files.set(path, bytes.subarray(start, start + size))

    cursor += 46 + nameLength + extraLength + commentLength
  }

  return files
}
