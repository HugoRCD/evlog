import type { RequestLogger } from 'evlog'

/** Minimal fetch context accepted by {@link createOutboundHooks}. */
export interface OutboundFetchContext {
  request: Request | string | URL
  options: {
    method?: string
    baseURL?: string
  }
  response?: Response
}

/** Hooks compatible with `ofetch` / `$fetch` interceptors. */
export interface OutboundHooks {
  onRequest?(context: OutboundFetchContext): void | Promise<void>
  onResponse?(context: OutboundFetchContext): void | Promise<void>
}

function resolveUrl(request: Request | string | URL, baseURL?: string): string {
  try {
    if (typeof request === 'string') {
      return baseURL ? new URL(request, baseURL).href : request
    }
    if (request instanceof URL) return request.href
    return request.url
  } catch {
    if (typeof request === 'string') return request
    if (request instanceof URL) return request.href
    return request.url
  }
}

/**
 * Track outbound HTTP calls on the current command logger.
 *
 * Pass the returned hooks to `ofetch.create()` or global `$fetch` options.
 *
 * @example
 * ```ts
 * import { ofetch } from 'ofetch'
 * import { useLogger } from '@evlog/cli'
 * import { createOutboundHooks } from '@evlog/cli/http'
 *
 * const api = ofetch.create(createOutboundHooks(useLogger()))
 * await api('/users')
 * ```
 */
export function createOutboundHooks(log: RequestLogger): OutboundHooks {
  return {
    onRequest({ request, options }) {
      log.set({
        http: {
          outbound: {
            method: options.method ?? 'GET',
            url: resolveUrl(request, options.baseURL),
          },
        },
      })
    },
    onResponse({ request, options, response }) {
      if (!response) return
      log.set({
        http: {
          outbound: {
            method: options.method ?? 'GET',
            url: resolveUrl(request, options.baseURL),
            status: response.status,
          },
        },
      })
    },
  }
}
