/**
 * A minimal WebM (Matroska) muxer for WebCodecs output.
 *
 * `MediaRecorder` is the obvious way to get video out of a canvas, and it is the
 * wrong one here: it timestamps frames against the wall clock. A frame that
 * takes 200ms to serialize and blur lands 200ms into the timeline, so a
 * carefully rendered 60fps take plays back as stuttering slow motion.
 *
 * Encoding through `VideoEncoder` lets us state the timestamp explicitly — but
 * then the chunks need a container. This writes just enough EBML for that:
 * header, one video track, and clusters of SimpleBlocks. No Cues, so the result
 * is not seekable by index, but every player and ffmpeg reads it fine.
 */

/** Elements are nested as byte arrays and wrapped once their length is known. */
type Element = Uint8Array

const ID = {
  EBML: 0x1A45DFA3,
  EBMLVersion: 0x4286,
  EBMLReadVersion: 0x42F7,
  EBMLMaxIDLength: 0x42F2,
  EBMLMaxSizeLength: 0x42F3,
  DocType: 0x4282,
  DocTypeVersion: 0x4287,
  DocTypeReadVersion: 0x4285,
  Segment: 0x18538067,
  Info: 0x1549A966,
  TimestampScale: 0x2AD7B1,
  MuxingApp: 0x4D80,
  WritingApp: 0x5741,
  Duration: 0x4489,
  Tracks: 0x1654AE6B,
  TrackEntry: 0xAE,
  TrackNumber: 0xD7,
  TrackUID: 0x73C5,
  TrackType: 0x83,
  CodecID: 0x86,
  Video: 0xE0,
  PixelWidth: 0xB0,
  PixelHeight: 0xBA,
  Cluster: 0x1F43B675,
  Timestamp: 0xE7,
  SimpleBlock: 0xA3,
} as const

/** A cluster's block timestamps are a signed 16-bit offset, so clusters must stay short. */
const CLUSTER_DURATION_MS = 1000

function bytesOf(value: number): Uint8Array {
  const bytes: number[] = []
  let remaining = value
  do {
    bytes.unshift(remaining & 0xFF)
    remaining = Math.floor(remaining / 256)
  } while (remaining > 0)
  return new Uint8Array(bytes)
}

/** EBML element IDs already carry their own length marker — write them verbatim. */
function encodeId(id: number): Uint8Array {
  return bytesOf(id)
}

/**
 * Variable-length integer, as used for element sizes.
 *
 * The length is signalled by the position of the first set bit, and the value
 * of all-ones at a given width is reserved to mean "unknown" — so a size that
 * would encode as all-ones has to spill into the next width up.
 */
function encodeSize(size: number): Uint8Array {
  for (let length = 1; length <= 8; length++) {
    const max = 2 ** (7 * length) - 1
    if (size >= max) continue
    const bytes = new Uint8Array(length)
    let remaining = size
    for (let i = length - 1; i >= 0; i--) {
      bytes[i] = remaining & 0xFF
      remaining = Math.floor(remaining / 256)
    }
    // Set the length marker in the leading byte.
    bytes[0] = (bytes[0] ?? 0) | (1 << (8 - length))
    return bytes
  }
  throw new Error('Element too large to encode.')
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function element(id: number, payload: Uint8Array): Element {
  return concat([encodeId(id), encodeSize(payload.length), payload])
}

function uintElement(id: number, value: number): Element {
  return element(id, bytesOf(value))
}

function stringElement(id: number, value: string): Element {
  return element(id, new TextEncoder().encode(value))
}

function floatElement(id: number, value: number): Element {
  const buffer = new ArrayBuffer(8)
  new DataView(buffer).setFloat64(0, value, false)
  return element(id, new Uint8Array(buffer))
}

export interface WebmTrack {
  width: number
  height: number
  /** Matroska codec id, e.g. `V_VP9`. */
  codec: string
}

interface PendingBlock {
  timestampMs: number
  keyframe: boolean
  data: Uint8Array
}

export class WebmMuxer {
  private clusters: Element[] = []
  private blocks: PendingBlock[] = []
  private clusterStart = 0
  /**
   * End of the last frame, not its start.
   *
   * Written as the start, the duration was short by one frame interval — and a
   * single-frame take reported zero, which players read as a still image rather
   * than as a video one frame long.
   */
  private durationMs = 0

  constructor(private track: WebmTrack) {}

  /** Append an encoded chunk. Timestamps are microseconds, as WebCodecs reports them. */
  addChunk(chunk: EncodedVideoChunk) {
    const data = new Uint8Array(chunk.byteLength)
    chunk.copyTo(data)
    const timestampMs = Math.round(chunk.timestamp / 1000)
    const keyframe = chunk.type === 'key'

    // A cluster must start on a keyframe and stay within the 16-bit block offset.
    if (this.blocks.length && keyframe && timestampMs - this.clusterStart >= CLUSTER_DURATION_MS) {
      this.flushCluster()
      this.clusterStart = timestampMs
    }
    if (!this.blocks.length) this.clusterStart = timestampMs

    this.blocks.push({ timestampMs, keyframe, data })
    this.durationMs = timestampMs + Math.round((chunk.duration ?? 0) / 1000)
  }

  private flushCluster() {
    if (!this.blocks.length) return
    const parts: Uint8Array[] = [uintElement(ID.Timestamp, this.clusterStart)]

    for (const block of this.blocks) {
      const header = new Uint8Array(4)
      // Track number 1 as a one-byte vint.
      header[0] = 0x81
      const relative = block.timestampMs - this.clusterStart
      new DataView(header.buffer).setInt16(1, relative, false)
      header[3] = block.keyframe ? 0x80 : 0x00
      parts.push(element(ID.SimpleBlock, concat([header, block.data])))
    }

    this.clusters.push(element(ID.Cluster, concat(parts)))
    this.blocks = []
  }

  finalize(): Blob {
    this.flushCluster()

    const header = element(ID.EBML, concat([
      uintElement(ID.EBMLVersion, 1),
      uintElement(ID.EBMLReadVersion, 1),
      uintElement(ID.EBMLMaxIDLength, 4),
      uintElement(ID.EBMLMaxSizeLength, 8),
      stringElement(ID.DocType, 'webm'),
      uintElement(ID.DocTypeVersion, 2),
      uintElement(ID.DocTypeReadVersion, 2),
    ]))

    const info = element(ID.Info, concat([
      // One millisecond per timestamp unit — the scale every timestamp above assumes.
      uintElement(ID.TimestampScale, 1_000_000),
      stringElement(ID.MuxingApp, 'render-labs'),
      stringElement(ID.WritingApp, 'render-labs'),
      floatElement(ID.Duration, this.durationMs),
    ]))

    const tracks = element(ID.Tracks, element(ID.TrackEntry, concat([
      uintElement(ID.TrackNumber, 1),
      uintElement(ID.TrackUID, 1),
      uintElement(ID.TrackType, 1),
      stringElement(ID.CodecID, this.track.codec),
      element(ID.Video, concat([
        uintElement(ID.PixelWidth, this.track.width),
        uintElement(ID.PixelHeight, this.track.height),
      ])),
    ])))

    const segment = element(ID.Segment, concat([info, tracks, ...this.clusters]))
    return new Blob([concat([header, segment])], { type: 'video/webm' })
  }
}
