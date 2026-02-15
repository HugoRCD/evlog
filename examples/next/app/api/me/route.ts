import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { createNextLogger, emitErrorAndRespond } from '../../../lib/evlog'
import { getSessionUser } from '../../../lib/session'
import { listUsers } from '../../../lib/shop-data'

// eslint-disable-next-line
export function GET(request: NextRequest) {
  const log = createNextLogger(request)
  try {
    const user = getSessionUser(request)
    log.set({ session: { authenticated: !!user } })

    const response = NextResponse.json({
      authenticated: !!user,
      user,
      users: listUsers(),
    })
    log.emit({ status: response.status })
    return response
  } catch (error) {
    return emitErrorAndRespond(log, error)
  }
}
