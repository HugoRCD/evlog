import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { createError, createRequestLogger, initLogger, parseError } from 'evlog'

initLogger({
  env: { service: 'hono-example' },
})

type AppBindings = {
  Variables: {
    log: ReturnType<typeof createRequestLogger>
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

app.get('/health', (c) => {
  c.get('log').set({ route: 'health' })
  return c.json({ ok: true })
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
  const parsed = parseError(error)

  return c.json(
    {
      message: parsed.message,
      why: parsed.why,
      fix: parsed.fix,
      link: parsed.link,
    },
    parsed.status,
  )
})

serve({
  fetch: app.fetch,
  port: 3000,
})

console.log('Hono server started on http://localhost:3000')
