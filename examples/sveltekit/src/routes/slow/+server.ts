import { json } from '@sveltejs/kit'
import { useLogger } from 'evlog/sveltekit'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () => {
  const log = useLogger()
  log.set({ action: 'generate_report', format: 'pdf' })

  // Simulate a slow operation (triggers tail sampling keep)
  await new Promise(resolve => setTimeout(resolve, 600))

  log.set({ report: { pages: 42, sizeKb: 1280 } })
  return json({ ok: true, pages: 42 })
}
