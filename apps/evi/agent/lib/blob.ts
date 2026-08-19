import { put } from '@vercel/blob'

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
 * sandbox data is an image; requiring the trailer too rejects data smuggled
 * around a real signature. Deliberately not a full decode.
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

interface SandboxFiles {
  readBinaryFile(input: { path: string }): PromiseLike<Uint8Array | null>
}

type PutImage = (
  key: string,
  body: Buffer,
  options: { access: 'public', addRandomSuffix: boolean, contentType: string },
) => Promise<{ url: string }>

/** Refusal when the store token is missing; callers may check it before doing expensive work. */
export function missingBlobTokenError(): string | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return null
  return 'BLOB_READ_WRITE_TOKEN is not configured. Locally, run `vercel env pull` in apps/evi.'
}

/**
 * Validate a sandbox image and upload it to the public Blob store: extension,
 * size, and magic bytes all have to agree before anything publishes. Returns
 * the public URL, or the reason the file was refused.
 */
export async function uploadSandboxImage(
  sandbox: SandboxFiles,
  path: string,
  putImage: PutImage = put,
): Promise<{ url: string, bytes: number } | { error: string }> {
  const contentType = imageContentType(path)
  if (!contentType) {
    return { error: `"${path}" is not a supported image (png/jpg/webp/gif).` }
  }
  const missingToken = missingBlobTokenError()
  if (missingToken) {
    return { error: missingToken }
  }
  const bytes = await sandbox.readBinaryFile({ path })
  if (bytes === null) {
    return { error: `No file at "${path}".` }
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { error: `Image is ${bytes.byteLength} bytes; the limit is ${MAX_IMAGE_BYTES}.` }
  }
  if (sniffImageContentType(bytes) !== contentType) {
    return { error: `The content of "${path}" does not match its extension; only real image files are uploaded.` }
  }
  try {
    const blob = await putImage(screenshotKey(path), Buffer.from(bytes), {
      access: 'public',
      addRandomSuffix: true,
      contentType,
    })
    return { url: blob.url, bytes: bytes.byteLength }
  } catch (error) {
    return { error: `The upload of "${path}" failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}
