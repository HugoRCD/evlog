import express from 'express'
import { createError, initLogger, parseError } from 'evlog'
import { evlog } from 'evlog/express'
import { createPostHogDrain } from 'evlog/posthog'
import { testUI } from './ui'

initLogger({
  env: { service: 'express-example' },
  pretty: true,
})

const app = express()

app.get('/', (_req, res) => res.type('html').send(testUI()))

app.use(evlog({
  drain: createPostHogDrain(),
  enrich: (ctx) => {
    ctx.event.runtime = 'node'
    ctx.event.pid = process.pid
  },
}))

app.get('/health', (req, res) => {
  req.log.set({ route: 'health' })
  res.json({ ok: true })
})

app.get('/users/:id', (req, res) => {
  const userId = req.params.id

  req.log.set({ user: { id: userId } })
  const user = { id: userId, name: 'Alice', plan: 'pro', email: 'alice@example.com' }

  const [local, domain] = user.email.split('@')
  req.log.set({ user: { name: user.name, plan: user.plan, email: `${local[0]}***@${domain}` } })

  const orders = [{ id: 'order_1', total: 4999 }, { id: 'order_2', total: 1299 }]
  req.log.set({ orders: { count: orders.length, totalRevenue: orders.reduce((sum, o) => sum + o.total, 0) } })

  res.json({ user, orders })
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

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error(err)
  const parsed = parseError(err)

  res.status(parsed.status).json({
    message: parsed.message,
    why: parsed.why,
    fix: parsed.fix,
    link: parsed.link,
  })
})

app.listen(3000, () => {
  console.log('Express server started on http://localhost:3000')
})
