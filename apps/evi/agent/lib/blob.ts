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

/** Store key for an uploaded capture; the random suffix added at upload keeps names unique. */
export function screenshotKey(path: string): string {
  const basename = path.slice(path.lastIndexOf('/') + 1)
  return `evi/screenshots/${basename}`
}
