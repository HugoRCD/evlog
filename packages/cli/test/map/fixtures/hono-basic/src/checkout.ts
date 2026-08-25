import { Hono } from 'hono'
import type { EvlogVariables } from 'evlog/hono'

const checkout = new Hono<EvlogVariables>()

checkout.post('/checkout', (c) => {
  const log = c.get('log')
  log.set({ user: { id: '123' } })
  log.audit({ action: 'checkout.completed', actor: { type: 'user', id: '123' } })
  return c.json({ ok: true })
})

export default checkout
