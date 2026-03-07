import { useLogger } from 'evlog/sveltekit'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = () => {
  const log = useLogger()
  log.set({ action: 'process_webhook' })

  // Simulate an unexpected runtime error (not an EvlogError)
  throw new Error('Cannot read properties of undefined (reading \'id\')')
}
