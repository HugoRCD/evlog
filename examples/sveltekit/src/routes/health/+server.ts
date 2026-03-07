import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = ({ locals }) => {
  locals.log.set({ route: 'health' })
  return json({ ok: true })
}
