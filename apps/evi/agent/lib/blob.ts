const CONTENT_TYPES: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** Content type from the file extension, or null for anything that is not an image. */
export function imageContentType(path: string): string | null {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return CONTENT_TYPES[extension] ?? null
}

/**
 * Content type from the file's magic bytes and structural end marker, or null
 * when the bytes are not a plausible complete image. Uploads are public the
 * instant they exist, so the extension alone must never decide that arbitrary
 * sandbox data is an image; requiring the format's trailer also rejects a
 * signature prefixed to arbitrary data and payload appended after a real
 * image. Deliberately not a full decode: captures come from Evi's own CLI in
 * her own sandbox, and a decoder dependency is not worth that residual risk.
 */
export function sniffImageContentType(bytes: Uint8Array): string | null {
  if (
    startsWith(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    && endsWith(bytes, [0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82])
  ) return 'image/png'
  if (startsWith(bytes, [0xFF, 0xD8, 0xFF]) && endsWith(bytes, [0xFF, 0xD9])) return 'image/jpeg'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38]) && endsWith(bytes, [0x3B])) return 'image/gif'
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
    && riffSize(bytes) === bytes.byteLength - 8
  ) return 'image/webp'
  return null
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

function endsWith(bytes: Uint8Array, trailer: readonly number[]): boolean {
  const offset = bytes.byteLength - trailer.length
  return offset >= 0 && trailer.every((byte, index) => bytes[offset + index] === byte)
}

function riffSize(bytes: Uint8Array): number {
  if (bytes.byteLength < 8) return -1
  return (bytes[4] ?? 0) | ((bytes[5] ?? 0) << 8) | ((bytes[6] ?? 0) << 16) | ((bytes[7] ?? 0) << 24)
}

/** Store key for an uploaded capture; the random suffix added at upload keeps names unique. */
export function screenshotKey(path: string): string {
  const basename = path.slice(path.lastIndexOf('/') + 1)
  return `evi/screenshots/${basename}`
}
