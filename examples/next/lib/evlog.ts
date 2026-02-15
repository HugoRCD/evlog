import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createRequestLogger, initLogger, parseError } from 'evlog'

declare global {
  // eslint-disable-next-line no-var
  var __evlogNextInitialized: boolean | undefined
}

function ensureEvlogInit() {
  if (globalThis.__evlogNextInitialized) {
    return
  }

  initLogger({
    env: { service: 'next-example' },
  })

  globalThis.__evlogNextInitialized = true
}

type EvlogRouteHandler = (context: {
  request: NextRequest
  log: ReturnType<typeof createRequestLogger>
}) => Promise<Response> | Response

export function withEvlog(handler: EvlogRouteHandler) {
  return async (request: NextRequest): Promise<Response> => {
    ensureEvlogInit()

    const log = createRequestLogger({
      method: request.method,
      path: request.nextUrl.pathname,
      requestId: request.headers.get('x-request-id') ?? undefined,
    })

    try {
      const response = await handler({ request, log })
      log.emit({ status: response.status })
      return response
    } catch (error) {
      const parsed = parseError(error)
      const status = parsed.status ?? 500

      log.error(error as Error)
      log.emit({ status, _forceKeep: true })

      return NextResponse.json({
        message: parsed.message,
        why: parsed.why,
        fix: parsed.fix,
        link: parsed.link,
      }, { status })
    }
  }
}
