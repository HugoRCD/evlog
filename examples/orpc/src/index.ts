import { os, ORPCError } from '@orpc/server'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { z } from 'zod'
import { createError, initLogger, parseError, type EnrichContext } from 'evlog'
import { evlog, useLogger, withEvlog, type EvlogOrpcContext } from 'evlog/orpc'
import { createPostHogDrain } from 'evlog/posthog'
import { testUI } from './ui'

initLogger({
  env: { service: 'orpc-example' },
  pretty: true,
})

const base = os.$context<EvlogOrpcContext>().use(evlog())

function findUserWithOrders(userId: string) {
  const log = useLogger()
  log.set({ user: { id: userId } })

  const user = { id: userId, name: 'Alice', plan: 'pro', email: 'alice@example.com' }
  const [local, domain] = user.email.split('@')
  log.set({ user: { name: user.name, plan: user.plan, email: `${local![0]}***@${domain}` } })

  const orders = [{ id: 'order_1', total: 4999 }, { id: 'order_2', total: 1299 }]
  log.set({
    orders: {
      count: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
    },
  })

  return { user, orders }
}

const router = {
  health: base
    .route({ method: 'GET', path: '/health' })
    .handler(({ context }) => {
      context.log.set({ route: 'health' })
      return { ok: true }
    }),

  getUser: base
    .route({ method: 'GET', path: '/users/{id}' })
    .input(z.object({ id: z.string() }))
    .handler(({ input }) => findUserWithOrders(input.id)),

  checkout: base
    .route({ method: 'POST', path: '/checkout' })
    .handler(({ context }) => {
      context.log.set({ cart: { items: 3, total: 9999 } })
      throw createError({
        message: 'Payment failed',
        status: 402,
        why: 'Card declined by issuer',
        fix: 'Try a different card or payment method',
        link: 'https://docs.example.com/payments/declined',
      })
    }),
}

const handler = withEvlog(
  new OpenAPIHandler<EvlogOrpcContext>(router, {
    interceptors: [
      async ({ next }) => {
        try {
          return await next()
        } catch (error) {
          if (error instanceof ORPCError) throw error
          const parsed = parseError(error)
          throw new ORPCError('INTERNAL_SERVER_ERROR', {
            status: parsed.status,
            message: parsed.message,
            data: { why: parsed.why, fix: parsed.fix, link: parsed.link, code: parsed.code },
          })
        }
      },
    ],
  }),
  {
    drain: createPostHogDrain(),
    enrich: (ctx: EnrichContext) => {
      ctx.event.runtime = 'bun'
      ctx.event.pid = process.pid
    },
  },
)

const port = Number(process.env.PORT ?? 3000)

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(testUI(), { headers: { 'content-type': 'text/html' } })
    }
    const { matched, response } = await handler.handle(request, {
      context: {} as EvlogOrpcContext,
    })
    return matched ? response : new Response('Not Found', { status: 404 })
  },
})

console.log(`oRPC server started on http://localhost:${server.port}`)
