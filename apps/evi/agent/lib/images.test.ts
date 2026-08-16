import { describe, expect, it } from 'vitest'
import { classifyImageUrl, fetchImage, MAX_INLINE_IMAGE_BYTES } from './images'

const PNG = new Uint8Array([
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
  0x00,
  0x49,
  0x45,
  0x4E,
  0x44,
  0xAE,
  0x42,
  0x60,
  0x82,
])

function respondWith(body: Uint8Array | null, init: { headers?: Record<string, string>, status?: number } = {}) {
  return (() => Promise.resolve(new Response(body && Buffer.from(body), { status: init.status ?? 200, headers: init.headers }))) as unknown as typeof fetch
}

describe('classifyImageUrl', () => {
  it('accepts Linear uploads', () => {
    const result = classifyImageUrl('https://uploads.linear.app/abc/def.png')
    expect(result).toMatchObject({ host: 'linear' })
  })

  it('accepts GitHub user attachments and githubusercontent hosts', () => {
    expect(classifyImageUrl('https://github.com/user-attachments/assets/uuid')).toMatchObject({ host: 'github' })
    expect(classifyImageUrl('https://user-images.githubusercontent.com/1/shot.png')).toMatchObject({ host: 'github' })
    expect(classifyImageUrl('https://private-user-images.githubusercontent.com/1/shot.png?jwt=x')).toMatchObject({ host: 'github' })
  })

  it('refuses other GitHub paths and unknown hosts', () => {
    expect(classifyImageUrl('https://github.com/HugoRCD/evlog/raw/main/logo.png')).toHaveProperty('error')
    expect(classifyImageUrl('https://evil.example/image.png')).toHaveProperty('error')
    expect(classifyImageUrl('https://xgithubusercontent.com/shot.png')).toHaveProperty('error')
  })

  it('refuses non-https URLs, embedded credentials, and garbage', () => {
    expect(classifyImageUrl('http://uploads.linear.app/a.png')).toHaveProperty('error')
    expect(classifyImageUrl('https://user:pass@uploads.linear.app/a.png')).toHaveProperty('error')
    expect(classifyImageUrl('not a url')).toHaveProperty('error')
  })
})

describe('fetchImage', () => {
  const url = new URL('https://uploads.linear.app/abc/def.png')

  it('returns base64 bytes and the sniffed media type', async () => {
    const result = await fetchImage(url, { fetchImpl: respondWith(PNG) })
    expect(result).toEqual({
      base64: Buffer.from(PNG).toString('base64'),
      bytes: PNG.byteLength,
      mediaType: 'image/png',
    })
  })

  it('sends the authorization header when given one', async () => {
    let seen: string | null = null
    const fetchImpl = ((_input: unknown, init?: RequestInit) => {
      seen = new Headers(init?.headers).get('authorization')
      return Promise.resolve(new Response(Buffer.from(PNG)))
    }) as unknown as typeof fetch
    await fetchImage(url, { authorization: 'Bearer token', fetchImpl })
    expect(seen).toBe('Bearer token')
  })

  it('reports an HTTP failure with its status', async () => {
    const result = await fetchImage(url, { fetchImpl: respondWith(null, { status: 403 }) })
    expect(result).toEqual({ error: 'The image request failed with HTTP 403.' })
  })

  it('refuses an oversized image, from the header or the bytes', async () => {
    const declared = await fetchImage(url, {
      fetchImpl: respondWith(PNG, { headers: { 'content-length': String(MAX_INLINE_IMAGE_BYTES + 1) } }),
    })
    expect(declared).toHaveProperty('error')
    const oversized = new Uint8Array(MAX_INLINE_IMAGE_BYTES + 1)
    oversized.set(PNG)
    const actual = await fetchImage(url, { fetchImpl: respondWith(oversized) })
    expect(actual).toHaveProperty('error')
  })

  it('refuses bytes that are not a complete raster image', async () => {
    const result = await fetchImage(url, { fetchImpl: respondWith(new Uint8Array([0x00, 0x01, 0x02])) })
    expect(result).toEqual({ error: 'The response is not a complete png/jpg/webp/gif image.' })
  })

  it('reports a network failure instead of throwing', async () => {
    const fetchImpl = (() => Promise.reject(new Error('socket hang up'))) as unknown as typeof fetch
    const result = await fetchImage(url, { fetchImpl })
    expect(result).toEqual({ error: 'The image could not be downloaded: socket hang up' })
  })
})
