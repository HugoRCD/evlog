/**
 * Uncaught errors from browser extensions surface through `capture_exceptions`
 * even though the site does not own that injected code. A stack frame served
 * over one of these schemes is one tell; an extension-only API named in the
 * message is the other, and the only one when the error carries no frames.
 */
const EXTENSION_FRAME_SCHEMES = ['chrome-extension://', 'moz-extension://', 'safari-web-extension://']
const EXTENSION_API_MARKERS = ['runtime.sendMessage', 'chrome.runtime', 'browser.runtime']

/**
 * Classic cross-origin noise: the browser strips the real message and stack.
 * `Script error.` is the window.onerror form; Firefox reports the same class
 * as `Permission denied to access object` with only the autocapture frame.
 */
const CROSS_ORIGIN_MESSAGES = new Set([
  'Script error.',
  'Script error',
  'Permission denied to access object',
])
const NON_SITE_FRAME_MARKERS = [
  ...EXTENSION_FRAME_SCHEMES,
  'exception-autocapture',
]

export interface CapturedException {
  type?: string
  value?: string
  stacktrace?: {
    frames?: Array<{ filename?: string }>
  }
}

export interface CapturedExceptionProperties {
  $exception_list?: CapturedException[]
}

export function isExtensionException(properties: CapturedExceptionProperties | undefined): boolean {
  const exceptions = properties?.$exception_list
  if (!Array.isArray(exceptions)) return false

  return exceptions.some((exception) => {
    const frames = exception?.stacktrace?.frames
    if (Array.isArray(frames) && frames.some(frame => EXTENSION_FRAME_SCHEMES.some(scheme => frame?.filename?.startsWith(scheme)))) {
      return true
    }
    const message = `${exception?.type ?? ''} ${exception?.value ?? ''}`
    return EXTENSION_API_MARKERS.some(marker => message.includes(marker))
  })
}

export function isCrossOriginException(properties: CapturedExceptionProperties | undefined): boolean {
  const exceptions = properties?.$exception_list
  if (!Array.isArray(exceptions)) return false

  return exceptions.some((exception) => {
    if (!CROSS_ORIGIN_MESSAGES.has(exception?.value ?? '')) return false
    return !hasSiteFrame(exception)
  })
}

/** Drop `$exception` events that are not the site's code. */
export function shouldDropCapturedException(properties: CapturedExceptionProperties | undefined): boolean {
  return isExtensionException(properties) || isCrossOriginException(properties)
}

function hasSiteFrame(exception: CapturedException): boolean {
  const frames = exception.stacktrace?.frames
  if (!Array.isArray(frames) || frames.length === 0) return false

  return frames.some((frame) => {
    const filename = frame?.filename ?? ''
    return filename.length > 0 && !NON_SITE_FRAME_MARKERS.some(marker => filename.includes(marker))
  })
}
