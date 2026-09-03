import { describe, expect, it } from 'vitest'
import { isChunkLoadError } from '../app/utils/chunk-load-error'

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://www.evlog.dev/_nuxt/DgnQ7b28.js',
    'error loading dynamically imported module: https://www.evlog.dev/_nuxt/WcfzClUS.js',
    'Importing a module script failed.',
  ])('matches %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
    expect(isChunkLoadError(message)).toBe(true)
  })

  it('ignores first-party exceptions', () => {
    expect(isChunkLoadError(new TypeError('Cannot read properties of undefined (reading \'id\')'))).toBe(false)
    expect(isChunkLoadError(new Error('Script error.'))).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})
