import { Elysia } from 'elysia'
import { createError, initLogger, parseError, type EnrichContext } from 'evlog'
import { evlog, useLogger } from 'evlog/elysia'
import { createPostHogDrain } from 'evlog/posthog'
import { testUI } from './ui'

initLogger({
  env: { service: 'elysia-example' },
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

const app = new Elysia()
  .get('/', () => new Response(testUI(), { headers: { 'content-type': 'text/html' } }))
  .use(evlog({
    drain: createPostHogDrain(),
    enrich: (ctx: EnrichContext) => {
      ctx.event.runtime = 'bun'
      ctx.event.pid = process.pid
    },
  }))
  .get('/health', ({ log }) => {
    log.set({ route: 'health' })
    return { ok: true }
  })
  .get('/users/:id', ({ params }) => {
    const result = findUserWithOrders(params.id)
    return result
  })
  .get('/checkout', () => {
    throw createError({
      message: 'Payment failed',
      status: 402,
      why: 'Card declined by issuer',
      fix: 'Try a different card or payment method',
      link: 'https://docs.example.com/payments/declined',
    })
  })
  .onError(({ error, set }) => {
    const parsed = parseError(error)
    set.status = parsed.status
    return {
      message: parsed.message,
      why: parsed.why,
      fix: parsed.fix,
      link: parsed.link,
    }
  })
  .listen(3000)

console.log(`Elysia server started on http://localhost:${app.server?.port}`)
