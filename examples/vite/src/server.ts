import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { evlog, type EvlogVariables } from 'evlog/hono'
import { createError, log, parseError } from 'evlog'
import { chargeUser } from './utils/billing'
import { testUI } from './ui'

const app = new Hono<EvlogVariables>()

app.get('/', c => c.html(testUI()))

app.use(evlog())

app.get('/health', (c) => {
  log.debug({ action: 'health_check' })
  log.info({ action: 'health', status: 'ok' })
  return c.json({ ok: true })
})

app.get('/users/:id', (c) => {
  const userId = c.req.param('id')
  const l = c.get('log')

  l.set({ user: { id: userId } })
  const user = { id: userId, name: 'Alice', plan: 'pro', email: 'alice@example.com' }

  const [local, domain] = user.email.split('@')
  l.set({ user: { name: user.name, plan: user.plan, email: `${local[0]}***@${domain}` } })

  return c.json(user)
})

app.get('/checkout', (c) => {
  const result = chargeUser('user_123', 4999)
  return c.json(result)
})

app.get('/error', () => {
  throw createError({
    message: 'Payment failed',
    status: 402,
    why: 'Card declined by issuer',
    fix: 'Try a different card or payment method',
  })
})

app.onError((error, c) => {
  c.get('log').error(error)
  const parsed = parseError(error)
  return c.json({
    message: parsed.message,
    why: parsed.why,
    fix: parsed.fix,
  }, parsed.status as any)
})

serve({ fetch: app.fetch, port: 3000 })

console.log('Server started on http://localhost:3000')
