import { NextResponse } from 'next/server'

import { withEvlog } from '../../../../lib/evlog'
import { DEMO_USER_COOKIE, getSessionUser } from '../../../../lib/session'

export const POST = withEvlog(async ({ request, log }) => {
  const currentUser = getSessionUser(request)
  log.set({ auth: { action: 'logout', userId: currentUser?.id ?? null } })

  const response = NextResponse.json({ ok: true })
  response.cookies.set(DEMO_USER_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
})
