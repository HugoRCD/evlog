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

const CATCHER_FRAME_MARKERS = ['exception-autocapture', 'onunhandledrejection']

export interface CapturedExceptionFrame {
  filename?: string
  source?: string
  function?: string
  mangled_name?: string
}

export interface CapturedException {
  type?: string
  value?: string
  stacktrace?: {
    frames?: CapturedExceptionFrame[]
  }
}

export interface CapturedExceptionProperties {
  $exception_list?: CapturedException[]
}

function exceptionList(properties: CapturedExceptionProperties | undefined): CapturedException[] | undefined {
  const exceptions = properties?.$exception_list
  return Array.isArray(exceptions) ? exceptions : undefined
}

function frameHaystack(frame: CapturedExceptionFrame): string {
  return `${frame.filename ?? ''} ${frame.source ?? ''} ${frame.function ?? ''} ${frame.mangled_name ?? ''}`
}

function isExtensionFrame(frame: CapturedExceptionFrame): boolean {
  const filename = frame.filename ?? frame.source ?? ''
  return EXTENSION_FRAME_SCHEMES.some(scheme => filename.startsWith(scheme))
}

function isCatcherFrame(frame: CapturedExceptionFrame): boolean {
  const haystack = frameHaystack(frame)
  return CATCHER_FRAME_MARKERS.some(marker => haystack.includes(marker))
}

function hasSiteFrame(exception: CapturedException): boolean {
  const frames = exception.stacktrace?.frames
  if (!Array.isArray(frames) || frames.length === 0) return false

  return frames.some((frame) => {
    const filename = frame.filename ?? frame.source ?? ''
    const fn = frame.function ?? frame.mangled_name ?? ''
    if (!filename && !fn) return false
    return !isExtensionFrame(frame) && !isCatcherFrame(frame)
  })
}

export function isExtensionException(properties: CapturedExceptionProperties | undefined): boolean {
  const exceptions = exceptionList(properties)
  if (!exceptions) return false

  return exceptions.some((exception) => {
    const frames = exception?.stacktrace?.frames
    if (Array.isArray(frames) && frames.some(frame => isExtensionFrame(frame))) {
      return true
    }
    const message = `${exception?.type ?? ''} ${exception?.value ?? ''}`
    return EXTENSION_API_MARKERS.some(marker => message.includes(marker))
  })
}

export function isCrossOriginException(properties: CapturedExceptionProperties | undefined): boolean {
  const exceptions = exceptionList(properties)
  if (!exceptions) return false

  return exceptions.some((exception) => {
    if (!CROSS_ORIGIN_MESSAGES.has(exception?.value ?? '')) return false
    return !hasSiteFrame(exception)
  })
}

/** Drop `$exception` events that are not the site's code. */
export function shouldDropCapturedException(properties: CapturedExceptionProperties | undefined): boolean {
  return isExtensionException(properties) || isCrossOriginException(properties)
}
