import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createError, initLogger, parseError } from 'evlog'
import { evlog, type EvlogVariables } from 'evlog/hono'
import { createPostHogDrain } from 'evlog/posthog'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { testUI } from './ui'

initLogger({
  env: { service: 'hono-example' },
  pretty: true,
})

const app = new Hono<EvlogVariables>()

app.get('/', c => c.html(testUI()))

app.use(evlog({
  drain: createPostHogDrain(),
  enrich: (ctx) => {
    ctx.event.runtime = 'node'
    ctx.event.pid = process.pid
  },
}))

app.get('/health', (c) => {
  c.get('log').set({ route: 'health' })
  return c.json({ ok: true })
})

app.get('/users/:id', (c) => {
  const log = c.get('log')
  const userId = c.req.param('id')

  log.set({ user: { id: userId } })
  const user = { id: userId, name: 'Alice', plan: 'pro', email: 'alice@example.com' }

  const [local, domain] = user.email.split('@')
  log.set({ user: { name: user.name, plan: user.plan, email: `${local[0]}***@${domain}` } })

  const orders = [{ id: 'order_1', total: 4999 }, { id: 'order_2', total: 1299 }]
  log.set({ orders: { count: orders.length, totalRevenue: orders.reduce((sum, o) => sum + o.total, 0) } })

  return c.json({ user, orders })
})

app.get('/checkout', () => {
  throw createError({
    message: 'Payment failed',
    status: 402,
    why: 'Card declined by issuer',
    fix: 'Try a different card or payment method',
    link: 'https://docs.example.com/payments/declined',
  })
})

app.onError((error, c) => {
  c.get('log').error(error)
  const parsed = parseError(error)

  return c.json(
    {
      message: parsed.message,
      why: parsed.why,
      fix: parsed.fix,
      link: parsed.link,
    },
    parsed.status as ContentfulStatusCode,
  )
})

serve({ fetch: app.fetch, port: 3000 })

console.log('Hono server started on http://localhost:3000')
