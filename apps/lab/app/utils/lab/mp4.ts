/**
 * A minimal MP4 (ISO BMFF) muxer for H.264 output from WebCodecs.
 *
 * WebM is the cheaper container to write, but almost every editor, Keynote and
 * social uploader wants MP4/H.264 — so a release video that has to be handed to
 * someone else needs this path.
 *
 * The file is written non-fragmented: `ftyp`, then one `mdat` holding every
 * sample, then a `moov` describing them. That ordering is only possible because
 * the whole take is buffered in memory anyway, and it avoids the bookkeeping of
 * fragments entirely — the sample tables are built once, at the end, when every
 * size and offset is already known.
 */

const UNITY_MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000]

/** Sub-millisecond precision at any integer frame rate, with an exact per-frame delta. */
const TIMESCALE_PER_FPS = 1000

class Writer {
  private parts: Uint8Array[] = []
  private length = 0

  bytes(value: Uint8Array) {
    this.parts.push(value)
    this.length += value.length
    return this
  }

  u16(value: number) {
    return this.bytes(new Uint8Array([(value >> 8) & 0xFF, value & 0xFF]))
  }

  u32(value: number) {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setUint32(0, value >>> 0, false)
    return this.bytes(bytes)
  }

  i32(value: number) {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setInt32(0, value, false)
    return this.bytes(bytes)
  }

  ascii(value: string) {
    return this.bytes(new TextEncoder().encode(value))
  }

  zeros(count: number) {
    return this.bytes(new Uint8Array(count))
  }

  build(): Uint8Array {
    const result = new Uint8Array(this.length)
    let offset = 0
    for (const part of this.parts) {
      result.set(part, offset)
      offset += part.length
    }
    return result
  }
}

/** Wrap a payload in a box header: 32-bit size, then the four-character type. */
function box(type: string, ...payloads: Uint8Array[]): Uint8Array {
  const size = payloads.reduce((sum, part) => sum + part.length, 8)
  const writer = new Writer().u32(size).ascii(type)
  for (const payload of payloads) writer.bytes(payload)
  return writer.build()
}

/** A box whose payload starts with the version/flags word. */
function fullBox(type: string, version: number, flags: number, ...payloads: Uint8Array[]): Uint8Array {
  const header = new Writer().u32(((version & 0xFF) << 24) | (flags & 0xFFFFFF)).build()
  return box(type, header, ...payloads)
}

export interface Mp4Track {
  width: number
  height: number
  fps: number
  /**
   * The `avcC` decoder configuration record, taken from the encoder's first
   * output metadata. Without it a player has no SPS/PPS and cannot decode a
   * single frame, so muxing cannot start until the encoder has emitted it.
   */
  description: Uint8Array
}

interface Sample {
  size: number
  keyframe: boolean
}

interface Timing {
  /** Ticks per second for the movie and media headers. */
  timescale: number
  /** Ticks each sample occupies. */
  delta: number
  duration: number
}

export class Mp4Muxer {
  private samples: Sample[] = []
  private payloads: Uint8Array[] = []
  private track: Mp4Track | null = null

  /**
   * Append an encoded chunk.
   *
   * The first chunk carries the decoder configuration in its metadata; every
   * later one repeats or omits it, so only the first is worth reading.
   */
  addChunk(chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata, hint?: { width: number, height: number, fps: number }) {
    if (!this.track) {
      const description = metadata?.decoderConfig?.description
      if (!description || !hint) {
        throw new Error('MP4 muxing needs the decoder configuration from the first encoded chunk.')
      }
      this.track = {
        ...hint,
        description: description instanceof ArrayBuffer
          ? new Uint8Array(description)
          : new Uint8Array(description.buffer, description.byteOffset, description.byteLength),
      }
    }

    const data = new Uint8Array(chunk.byteLength)
    chunk.copyTo(data)
    this.payloads.push(data)
    this.samples.push({ size: data.length, keyframe: chunk.type === 'key' })
  }

  finalize(): Blob {
    const { track } = this
    if (!track || !this.samples.length) throw new Error('Nothing was encoded.')

    const timescale = track.fps * TIMESCALE_PER_FPS
    const delta = TIMESCALE_PER_FPS
    const duration = this.samples.length * delta

    const ftyp = box(
      'ftyp',
      new Writer().ascii('isom').u32(0x200).ascii('isom').ascii('iso2').ascii('avc1').ascii('mp41').build(),
    )

    const mediaBytes = this.payloads.reduce((sum, part) => sum + part.length, 0)
    const mdat = new Writer().u32(mediaBytes + 8).ascii('mdat')
    for (const payload of this.payloads) mdat.bytes(payload)

    // Every sample sits in a single chunk, so the only offset the tables need is
    // where `mdat`'s payload begins — right after `ftyp` and `mdat`'s own header.
    const chunkOffset = ftyp.length + 8
    const moov = this.buildMoov(track, { timescale, delta, duration }, chunkOffset)

    return new Blob([ftyp, mdat.build(), moov] as BlobPart[], { type: 'video/mp4' })
  }

  private buildMoov(track: Mp4Track, timing: Timing, chunkOffset: number): Uint8Array {
    const { timescale, delta, duration } = timing
    const matrix = () => {
      const writer = new Writer()
      for (const value of UNITY_MATRIX) writer.i32(value)
      return writer.build()
    }

    const mvhd = fullBox('mvhd', 0, 0, new Writer()
      .u32(0).u32(0) // creation / modification time
      .u32(timescale).u32(duration)
      .u32(0x00010000) // rate 1.0
      .u16(0x0100) // volume 1.0
      .zeros(10) // reserved
      .bytes(matrix())
      .zeros(24) // predefined
      .u32(2) // next track id
      .build())

    // Flags 0x07: track enabled, in movie, in preview.
    const tkhd = fullBox('tkhd', 0, 0x07, new Writer()
      .u32(0).u32(0)
      .u32(1) // track id
      .u32(0) // reserved
      .u32(duration)
      .zeros(8) // reserved
      .u16(0) // layer
      .u16(0) // alternate group
      .u16(0) // volume — silent, this is a video track
      .u16(0) // reserved
      .bytes(matrix())
      // Display size as 16.16 fixed point.
      .u32(track.width * 0x10000).u32(track.height * 0x10000)
      .build())

    const mdhd = fullBox('mdhd', 0, 0, new Writer()
      .u32(0).u32(0)
      .u32(timescale).u32(duration)
      .u16(0x55C4) // language: 'und'
      .u16(0)
      .build())

    const hdlr = fullBox('hdlr', 0, 0, new Writer()
      .u32(0)
      .ascii('vide')
      .zeros(12)
      .ascii('VideoHandler\0')
      .build())

    const vmhd = fullBox('vmhd', 0, 1, new Writer().u16(0).zeros(6).build())
    // A single self-contained data reference: the media lives in this file.
    const dref = fullBox('dref', 0, 0, new Writer().u32(1).bytes(fullBox('url ', 0, 1)).build())
    const dinf = box('dinf', dref)

    const avcC = box('avcC', track.description)
    const avc1 = box('avc1', new Writer()
      .zeros(6) // reserved
      .u16(1) // data reference index
      .zeros(16) // predefined + reserved
      .u16(track.width).u16(track.height)
      .u32(0x00480000).u32(0x00480000) // 72 dpi horizontal / vertical
      .u32(0) // reserved
      .u16(1) // frame count
      .zeros(32) // compressor name
      .u16(0x0018) // depth
      .u16(0xFFFF) // predefined
      .build(), avcC)
    const stsd = fullBox('stsd', 0, 0, new Writer().u32(1).build(), avc1)

    // Every frame lasts exactly one delta, so the whole table is one entry.
    const stts = fullBox('stts', 0, 0, new Writer()
      .u32(1)
      .u32(this.samples.length).u32(delta)
      .build())

    const syncSamples = this.samples
      .map((sample, index) => (sample.keyframe ? index + 1 : 0))
      .filter(Boolean)
    const stssWriter = new Writer().u32(syncSamples.length)
    for (const index of syncSamples) stssWriter.u32(index)
    const stss = fullBox('stss', 0, 0, stssWriter.build())

    const stsc = fullBox('stsc', 0, 0, new Writer()
      .u32(1)
      .u32(1).u32(this.samples.length).u32(1)
      .build())

    // Sample size 0 means "per-sample sizes follow".
    const stszWriter = new Writer().u32(0).u32(this.samples.length)
    for (const sample of this.samples) stszWriter.u32(sample.size)
    const stsz = fullBox('stsz', 0, 0, stszWriter.build())

    const stco = fullBox('stco', 0, 0, new Writer().u32(1).u32(chunkOffset).build())

    const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco)
    const minf = box('minf', vmhd, dinf, stbl)
    const mdia = box('mdia', mdhd, hdlr, minf)
    const trak = box('trak', tkhd, mdia)

    return box('moov', mvhd, trak)
  }
}
