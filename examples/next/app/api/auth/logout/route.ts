import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createNextLogger, emitErrorAndRespond } from '../../../../lib/evlog'
import { DEMO_USER_COOKIE, getSessionUser } from '../../../../lib/session'

// eslint-disable-next-line
export async function POST(request: NextRequest) {
  const log = createNextLogger(request)
  try {
    const currentUser = getSessionUser(request)
    log.set({ auth: { action: 'logout', userId: currentUser?.id ?? null } })

    const response = NextResponse.json({ ok: true })
    response.cookies.set(DEMO_USER_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    log.emit({ status: response.status })
    return response
  } catch (error) {
    return emitErrorAndRespond(log, error)
  }
}
