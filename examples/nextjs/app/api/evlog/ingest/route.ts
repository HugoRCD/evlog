import { NextRequest } from 'next/server'

const VALID_LEVELS = ['info', 'error', 'warn', 'debug'] as const

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin) {
    const originHost = new URL(origin).host
    if (originHost !== host) {
      return Response.json({ error: 'Invalid origin' }, { status: 403 })
    }
  }

  const body = await request.json()

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.timestamp) {
    return Response.json({ error: 'Missing timestamp' }, { status: 400 })
  }

  if (!body.level || !VALID_LEVELS.includes(body.level)) {
    return Response.json({ error: 'Invalid level' }, { status: 400 })
  }

  const { service: _clientService, ...sanitizedPayload } = body

  const wideEvent = {
    ...sanitizedPayload,
    service: 'nextjs-example',
    environment: process.env.NODE_ENV || 'development',
    source: 'client',
  }

  console.log('[CLIENT LOG]', JSON.stringify(wideEvent))

  return new Response(null, { status: 204 })
}
