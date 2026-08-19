import { afterEach, describe, expect, it, vi } from 'vitest'
import { imageContentType, MAX_IMAGE_BYTES, screenshotKey, sniffImageContentType, uploadSandboxImage } from './blob'

describe('imageContentType', () => {
  it('maps image extensions case-insensitively', () => {
    expect(imageContentType('/workspace/screenshots/after.png')).toBe('image/png')
    expect(imageContentType('before.JPG')).toBe('image/jpeg')
    expect(imageContentType('diff.webp')).toBe('image/webp')
  })

  it('rejects non-image files', () => {
    expect(imageContentType('/workspace/repo/package.json')).toBeNull()
    expect(imageContentType('script.sh')).toBeNull()
    expect(imageContentType('noextension')).toBeNull()
  })
})

describe('screenshotKey', () => {
  it('keys by basename under the screenshots prefix', () => {
    expect(screenshotKey('/workspace/screenshots/after.png')).toBe('evi/screenshots/after.png')
    expect(screenshotKey('after.png')).toBe('evi/screenshots/after.png')
  })
})

describe('sniffImageContentType', () => {
  it('recognizes each supported format by its signature and trailer', () => {
    expect(sniffImageContentType(new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ]))).toBe('image/png')
    expect(sniffImageContentType(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0xFF, 0xD9]))).toBe('image/jpeg')
    expect(sniffImageContentType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x3B]))).toBe('image/gif')
    expect(sniffImageContentType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp')
  })

  it('rejects non-image bytes regardless of the claimed extension', () => {
    const text = new TextEncoder().encode('SECRET=hunter2\n')
    for (const name of ['leak.png', 'leak.jpg', 'leak.jpeg', 'leak.gif', 'leak.webp']) {
      expect(imageContentType(name)).not.toBeNull()
      expect(sniffImageContentType(text)).toBeNull()
    }
    expect(sniffImageContentType(new Uint8Array([]))).toBeNull()
    // RIFF container that is not WEBP (e.g. WAV) stays rejected.
    expect(sniffImageContentType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull()
  })

  it('rejects a bare signature with payload and payload appended after a real image', () => {
    const payload = new TextEncoder().encode('SECRET=hunter2')
    const pngSignatureOnly = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, ...payload])
    expect(sniffImageContentType(pngSignatureOnly)).toBeNull()
    expect(sniffImageContentType(new Uint8Array([0xFF, 0xD8, 0xFF, ...payload]))).toBeNull()
    expect(sniffImageContentType(new Uint8Array([0x47, 0x49, 0x46, 0x38, ...payload]))).toBeNull()
    const jpegThenPayload = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0xFF, 0xD9, ...payload])
    expect(sniffImageContentType(jpegThenPayload)).toBeNull()
    // WebP whose declared RIFF size disagrees with the actual length.
    expect(sniffImageContentType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, ...payload]))).toBeNull()
  })
})

describe('MAX_IMAGE_BYTES', () => {
  it('caps uploads at 8 MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024)
  })
})

describe('uploadSandboxImage', () => {
  const png = new Uint8Array([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
  ])

  function sandboxWith(bytes: Uint8Array | null) {
    return { readBinaryFile: vi.fn().mockResolvedValue(bytes) }
  }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uploads a validated image and returns its public URL', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'tok')
    const put = vi.fn().mockResolvedValue({ url: 'https://blob.example/after-x.png' })
    const result = await uploadSandboxImage(sandboxWith(png), '/workspace/screenshots/after.png', put)
    expect(result).toEqual({ url: 'https://blob.example/after-x.png', bytes: png.byteLength })
    expect(put).toHaveBeenCalledWith('evi/screenshots/after.png', Buffer.from(png), {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'image/png',
    })
  })

  it('refuses before reading anything when the token or extension is wrong', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'tok')
    const sandbox = sandboxWith(png)
    expect(await uploadSandboxImage(sandbox, '/workspace/repo/package.json')).toMatchObject({ error: expect.stringContaining('not a supported image') })
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', '')
    expect(await uploadSandboxImage(sandbox, 'after.png')).toMatchObject({ error: expect.stringContaining('BLOB_READ_WRITE_TOKEN') })
    expect(sandbox.readBinaryFile).not.toHaveBeenCalled()
  })

  it('refuses a missing file and bytes that do not match the extension', async () => {
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'tok')
    const put = vi.fn()
    expect(await uploadSandboxImage(sandboxWith(null), 'after.png', put)).toMatchObject({ error: expect.stringContaining('No file') })
    expect(await uploadSandboxImage(sandboxWith(new TextEncoder().encode('SECRET')), 'after.png', put))
      .toMatchObject({ error: expect.stringContaining('does not match its extension') })
    expect(put).not.toHaveBeenCalled()
  })
})
