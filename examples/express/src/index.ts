import express from 'express'
import { createError, initLogger, parseError, type EnrichContext } from 'evlog'
import { evlog, useLogger } from 'evlog/express'
import { createPostHogDrain } from 'evlog/posthog'
import { testUI } from './ui'

initLogger({
  env: { service: 'express-example' },
  pretty: true,
})

function findUserWithOrders(userId: string) {
  const log = useLogger()

  log.set({ user: { id: userId } })
  const user = { id: userId, name: 'Alice', plan: 'pro', email: 'alice@example.com' }

  const [local, domain] = user.email.split('@')
  log.set({ user: { name: user.name, plan: user.plan, email: `${local[0]}***@${domain}` } })

  const orders = [{ id: 'order_1', total: 4999 }, { id: 'order_2', total: 1299 }]
  log.set({ orders: { count: orders.length, totalRevenue: orders.reduce((sum, o) => sum + o.total, 0) } })

  return { user, orders }
}

const app = express()

app.get('/', (_req, res) => res.type('html').send(testUI()))

app.use(evlog({
  drain: createPostHogDrain(),
  enrich: (ctx: EnrichContext) => {
    ctx.event.runtime = 'node'
    ctx.event.pid = process.pid
  },
}))

app.get('/health', (req, res) => {
  req.log.set({ route: 'health' })
  res.json({ ok: true })
})

app.get('/users/:id', (req, res) => {
  const result = findUserWithOrders(req.params.id)
  res.json(result)
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
