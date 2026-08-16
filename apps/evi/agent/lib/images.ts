import { sniffImageContentType } from './blob'

/**
 * Raw-byte cap chosen so the base64 content part stays under eve's 3 MiB
 * session-history warning; the part is re-sent on every later model call.
 */
export const MAX_INLINE_IMAGE_BYTES = 2 * 1024 * 1024

const FETCH_TIMEOUT_MS = 15_000

export type ImageHost = 'github' | 'linear'

const ALLOWED_HOSTS_HINT = 'Supported image hosts: github.com/user-attachments, *.githubusercontent.com, uploads.linear.app.'

/**
 * Accepts only the hosts the platforms use for conversation attachments; the
 * URLs come out of untrusted markdown, so anything else is refused rather
 * than fetched.
 */
export function classifyImageUrl(raw: string): { host: ImageHost, url: URL } | { error: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { error: `"${raw}" is not a valid URL.` }
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
    return { error: `Only plain https URLs are fetched. ${ALLOWED_HOSTS_HINT}` }
  }
  if (url.hostname === 'uploads.linear.app') return { host: 'linear', url }
  if (url.hostname === 'github.com' && url.pathname.startsWith('/user-attachments/')) return { host: 'github', url }
  if (url.hostname.endsWith('.githubusercontent.com')) return { host: 'github', url }
  return { error: `Images on ${url.hostname} are not fetched. ${ALLOWED_HOSTS_HINT}` }
}

export interface FetchedImage {
  base64: string
  bytes: number
  mediaType: string
}

/**
 * Downloads an image and validates the bytes are a complete raster image
 * (png/jpg/webp/gif, same sniff as the blob uploads); the server's
 * content-type header is never trusted. Failures return a message naming
 * what went wrong, so the model can report it instead of guessing.
 */
export async function fetchImage(
  url: URL,
  options: { authorization?: string, fetchImpl?: typeof fetch } = {},
): Promise<FetchedImage | { error: string }> {
  const fetchImpl = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(url, {
      credentials: 'omit',
      headers: {
        accept: 'image/*',
        ...options.authorization ? { authorization: options.authorization } : {},
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    return { error: `The image could not be downloaded: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (!response.ok) {
    return { error: `The image request failed with HTTP ${response.status}.` }
  }
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_INLINE_IMAGE_BYTES) {
    return { error: `The image is ${declaredLength} bytes; the limit is ${MAX_INLINE_IMAGE_BYTES}.` }
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_INLINE_IMAGE_BYTES) {
    return { error: `The image is ${bytes.byteLength} bytes; the limit is ${MAX_INLINE_IMAGE_BYTES}.` }
  }
  const mediaType = sniffImageContentType(bytes)
  if (mediaType === null) {
    return { error: 'The response is not a complete png/jpg/webp/gif image.' }
  }
  return { base64: Buffer.from(bytes).toString('base64'), bytes: bytes.byteLength, mediaType }
}
