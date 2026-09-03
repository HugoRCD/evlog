import { describe, expect, it } from 'vitest'
import {
  isCrossOriginException,
  isExtensionException,
  shouldDropCapturedException,
} from '../app/utils/posthog-exceptions'

describe('isExtensionException', () => {
  it('drops a chrome-extension stack frame', () => {
    expect(isExtensionException({
      $exception_list: [{
        type: 'Error',
        value: 'boom',
        stacktrace: { frames: [{ filename: 'chrome-extension://abc/content.js' }] },
      }],
    })).toBe(true)
  })

  it('drops an extension-only API named in the message when there are no frames', () => {
    expect(isExtensionException({
      $exception_list: [{ type: 'Error', value: 'Invalid call to runtime.sendMessage(). Tab not found.' }],
    })).toBe(true)
  })

  it('keeps a first-party exception', () => {
    expect(isExtensionException({
      $exception_list: [{
        type: 'TypeError',
        value: 'Cannot read properties of undefined (reading \'id\')',
        stacktrace: { frames: [{ filename: 'https://www.evlog.dev/_nuxt/app.js' }] },
      }],
    })).toBe(false)
  })
})

describe('isCrossOriginException', () => {
  it('drops Script error. with no frames', () => {
    expect(isCrossOriginException({
      $exception_list: [{ type: 'Error', value: 'Script error.' }],
    })).toBe(true)
  })

  it('drops Firefox permission-denied when the only frame is exception-autocapture', () => {
    expect(isCrossOriginException({
      $exception_list: [{
        type: 'Error',
        value: 'Permission denied to access object',
        stacktrace: { frames: [{ filename: '../src/entrypoints/exception-autocapture.ts' }] },
      }],
    })).toBe(true)
  })

  it('keeps a first-party exception even if the message mentions permission', () => {
    expect(isCrossOriginException({
      $exception_list: [{
        type: 'Error',
        value: 'Permission denied to write file',
        stacktrace: { frames: [{ filename: 'https://www.evlog.dev/_nuxt/app.js' }] },
      }],
    })).toBe(false)
  })

  it('keeps Permission denied to access object when a site frame is present', () => {
    expect(isCrossOriginException({
      $exception_list: [{
        type: 'Error',
        value: 'Permission denied to access object',
        stacktrace: { frames: [{ filename: 'https://www.evlog.dev/_nuxt/app.js' }] },
      }],
    })).toBe(false)
  })
})

describe('shouldDropCapturedException', () => {
  it('drops extension and cross-origin events, keeps site-owned ones', () => {
    expect(shouldDropCapturedException({
      $exception_list: [{ type: 'Error', value: 'Script error.' }],
    })).toBe(true)
    expect(shouldDropCapturedException({
      $exception_list: [{ type: 'Error', value: 'Invalid call to runtime.sendMessage(). Tab not found.' }],
    })).toBe(true)
    expect(shouldDropCapturedException({
      $exception_list: [{
        type: 'TypeError',
        value: 'Cannot read properties of undefined (reading \'id\')',
        stacktrace: { frames: [{ filename: 'https://www.evlog.dev/_nuxt/app.js' }] },
      }],
    })).toBe(false)
  })
})
