import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { RequestLogger } from 'evlog'
import { createError, createRequestLogger, initLogger, parseError } from 'evlog'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

initLogger({
  env: { service: 'hono-example' },
  pretty: process.env.NODE_ENV !== 'production',
})

type AppBindings = {
  Variables: {
    log: RequestLogger
  }
}

const app = new Hono<AppBindings>()

app.use('*', async (c, next) => {
  const startedAt = Date.now()

  const log = createRequestLogger({
    method: c.req.method,
    path: c.req.path,
    requestId: c.req.header('x-request-id'),
  })

  c.set('log', log)

  try {
    await next()
  } catch (error) {
    log.error(error as Error)
    throw error
  } finally {
    log.emit({
      status: c.res.status,
      duration: Date.now() - startedAt,
    })
  }
})

// Simple route
app.get('/', (c) => {
  return c.json({ name: 'hono-example', routes: ['/health', '/users/:id', '/checkout'] })
})

// Health check
app.get('/health', (c) => {
  c.get('log').set({ route: 'health' })
  return c.json({ ok: true })
})

// Wide event example — accumulate context throughout the handler
app.get('/users/:id', (c) => {
  const log = c.get('log')
  const userId = c.req.param('id')

  // Simulate fetching a user from the database
  log.set({ user: { id: userId } })
  const user = { id: userId, name: 'Alice', plan: 'pro', email: 'alice@example.com' }

  // Log safe fields only — never log raw PII (emails, passwords, tokens)
  // Use masked values if you need them for debugging
  const [local, domain] = user.email.split('@')
  log.set({ user: { name: user.name, plan: user.plan, email: `${local[0]}***@${domain}` } })

  // Simulate loading related data
  const orders = [{ id: 'order_1', total: 4999 }, { id: 'order_2', total: 1299 }]
  log.set({ orders: { count: orders.length, totalRevenue: orders.reduce((sum, o) => sum + o.total, 0) } })

  // One wide event is emitted automatically with ALL accumulated context
  return c.json({ user, orders })
})

// Structured error example
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

serve({
  fetch: app.fetch,
  port: 3000,
})

console.log('Hono server started on http://localhost:3000')
