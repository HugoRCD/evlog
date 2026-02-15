import { NextResponse } from 'next/server'
import { createError } from 'evlog'

import { withEvlog } from '../../../../lib/evlog'
import { DEMO_USER_COOKIE } from '../../../../lib/session'
import { getUserById, listUsers } from '../../../../lib/shop-data'

type LoginBody = {
  userId?: string
}

export const POST = withEvlog(async ({ request, log }) => {
  const body = await request.json() as LoginBody
  const userId = body.userId

  if (!userId) {
    throw createError({
      message: 'Missing user selection',
      status: 400,
      why: 'No userId was sent in login payload',
      fix: 'Send one of the available demo user IDs from /api/me',
    })
  }

  const user = getUserById(userId)
  if (!user) {
    throw createError({
      message: 'Unknown user',
      status: 404,
      why: `User "${userId}" does not exist in demo fixtures`,
      fix: `Use one of these users: ${listUsers().map(u => u.id).join(', ')}`,
    })
  }

  log.set({ auth: { action: 'login', userId: user.id } })

  const response = NextResponse.json({ ok: true, user })
  response.cookies.set(DEMO_USER_COOKIE, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
  return response
})
