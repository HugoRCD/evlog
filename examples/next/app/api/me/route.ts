import { NextResponse } from 'next/server'

import { withEvlog } from '../../../lib/evlog'
import { getSessionUser } from '../../../lib/session'
import { listUsers } from '../../../lib/shop-data'

export const GET = withEvlog(async ({ request, log }) => {
  const user = getSessionUser(request)
  log.set({ session: { authenticated: !!user } })

  return NextResponse.json({
    authenticated: !!user,
    user,
    users: listUsers(),
  })
})
