import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import type { RequestLogger } from 'evlog'
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

export function createNextLogger(request: NextRequest): RequestLogger {
  ensureEvlogInit()
  return createRequestLogger({
    method: request.method,
    path: request.nextUrl.pathname,
    requestId: request.headers.get('x-request-id') ?? undefined,
  })
}

export function emitErrorAndRespond(log: RequestLogger, error: unknown): NextResponse {
  const parsed = parseError(error)
  const status = parsed.status ?? 500

  log.set({
    failure: {
      why: parsed.why,
      fix: parsed.fix,
      link: parsed.link,
    },
  })

  if (status >= 500) {
    log.error(error as Error, {
      error: {
        why: parsed.why,
        fix: parsed.fix,
        link: parsed.link,
      },
    })
  } else {
    // Keep 4xx logs at error level, but avoid noisy Next stack traces.
    const cleanError = {
      name: 'EvlogError',
      message: parsed.message,
      status,
    } as Error

    log.error(cleanError, {
      error: {
        status,
        message: parsed.message,
        why: parsed.why,
        fix: parsed.fix,
        link: parsed.link,
      },
    })
  }
  log.emit({ status, _forceKeep: true })

  return NextResponse.json({
    message: parsed.message,
    why: parsed.why,
    fix: parsed.fix,
    link: parsed.link,
  }, { status })
}
