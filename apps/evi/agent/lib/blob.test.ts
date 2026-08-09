import { describe, expect, it } from 'vitest'
import { imageContentType, MAX_IMAGE_BYTES, screenshotKey } from './blob'

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

describe('MAX_IMAGE_BYTES', () => {
  it('caps uploads at 8 MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024)
  })
})
