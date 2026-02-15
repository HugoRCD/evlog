import { defineHandler } from 'nitro/h3'
import { useLogger } from 'evlog'

export default defineHandler((event) => {
  const log = useLogger(event)

  log.set({ user: { id: 1, plan: 'pro' } })
  log.set({ cart: { id: 42, items: 3, total: 9999 } })
  log.set({ payment: { method: 'card', status: 'success' } })

  return { success: true }
})
