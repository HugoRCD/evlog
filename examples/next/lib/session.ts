import { createError } from 'evlog'
import type { NextRequest } from 'next/server'

import { getUserById, type DemoUser } from './shop-data'

export const DEMO_USER_COOKIE = 'evlog_demo_user'

export function getSessionUser(request: NextRequest): DemoUser | null {
  const userId = request.cookies.get(DEMO_USER_COOKIE)?.value
  if (!userId) {
    return null
  }
  return getUserById(userId) ?? null
}

export function requireSessionUser(request: NextRequest): DemoUser {
  const user = getSessionUser(request)
  if (!user) {
    throw createError({
      message: 'Authentication required',
      status: 401,
      why: 'No authenticated demo user in session',
      fix: 'Login from the UI before calling this endpoint',
    })
  }
  return user
}
