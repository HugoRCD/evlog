import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createNextLogger, emitErrorAndRespond } from '../../../lib/evlog'
import { getSessionUser } from '../../../lib/session'

// eslint-disable-next-line
export async function GET(request: NextRequest) {
  const log = createNextLogger(request)
  try {
    const user = getSessionUser(request)
    log.set({ action: 'hello', adapter: 'next-route-handler', authenticated: !!user })

    const response = NextResponse.json({
      ok: true,
      message: user
        ? `Hello ${user.name}, welcome back to the demo store`
        : 'Hello from Next + evlog',
    })
    log.emit({ status: response.status })
    return response
  } catch (error) {
    return emitErrorAndRespond(log, error)
  }
}
