import { vi } from 'vitest'

/**
 * Spy on `globalThis.fetch` and resolve every call with a 200 response (or the
 * given override). Returns the spy so callers can assert URLs, headers, and
 * bodies. Pair with `vi.restoreAllMocks()` in `afterEach`.
 *
 * Centralizes the pattern used by every adapter test (axiom, posthog, otlp,
 * sentry, datadog, better-stack, hyperdx, ...).
 */
export function mockFetch(
  response: Response | (() => Response | Promise<Response>) = new Response(null, { status: 200 }),
): ReturnType<typeof vi.spyOn> {
  const factory = typeof response === 'function' ? response : () => response
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(factory()))
}

/**
 * Read the URL + RequestInit from the n-th call to a fetch spy.
 *
 * @param spy The spy returned by {@link mockFetch}.
 * @param index Call index, defaults to the first call.
 */
export function getFetchCall(
  spy: ReturnType<typeof vi.spyOn>,
  index = 0,
): { url: string, init: RequestInit } {
  const call = spy.mock.calls[index] as [string | URL | Request, RequestInit | undefined] | undefined
  if (!call) {
    throw new Error(`getFetchCall: no call at index ${index} (saw ${spy.mock.calls.length})`)
  }
  const [rawUrl, init = {}] = call
  const url = typeof rawUrl === 'string'
    ? rawUrl
    : rawUrl instanceof Request
      ? rawUrl.url
      : rawUrl.toString()
  return { url, init }
}

/**
 * Read the parsed JSON body of the n-th fetch call.
 */
export function getFetchJson<T = unknown>(
  spy: ReturnType<typeof vi.spyOn>,
  index = 0,
): T {
  const { init } = getFetchCall(spy, index)
  if (typeof init.body !== 'string') {
    throw new Error('getFetchJson: body is not a string — was the request JSON-encoded?')
  }
  return JSON.parse(init.body) as T
}

/**
 * Read the headers of the n-th fetch call as a plain object (lowercased keys
 * for `Headers` instances, kept as-is for plain records).
 */
export function getFetchHeaders(
  spy: ReturnType<typeof vi.spyOn>,
  index = 0,
): Record<string, string> {
  const { init } = getFetchCall(spy, index)
  if (!init.headers) return {}
  if (init.headers instanceof Headers) {
    const out: Record<string, string> = {}
    init.headers.forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  if (Array.isArray(init.headers)) {
    return Object.fromEntries(init.headers as [string, string][])
  }
  return { ...(init.headers as Record<string, string>) }
}
