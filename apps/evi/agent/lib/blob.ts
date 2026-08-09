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
 * Content type from the file's magic bytes, or null when the bytes are not an
 * image. Uploads are public the instant they exist, so the extension alone
 * must never decide that arbitrary sandbox data is an image.
 */
export function sniffImageContentType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'image/png'
  if (startsWith(bytes, [0xFF, 0xD8, 0xFF])) return 'image/jpeg'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) return 'image/webp'
  return null
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

/** Store key for an uploaded capture; the random suffix added at upload keeps names unique. */
export function screenshotKey(path: string): string {
  const basename = path.slice(path.lastIndexOf('/') + 1)
  return `evi/screenshots/${basename}`
}
