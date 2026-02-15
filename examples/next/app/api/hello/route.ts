import { NextResponse } from 'next/server'

import { withEvlog } from '../../../lib/evlog'

export const GET = withEvlog(async ({ log }) => {
  log.set({ action: 'hello', adapter: 'next-route-handler' })

  return NextResponse.json({
    ok: true,
    message: 'Hello from Next + evlog',
  })
})
