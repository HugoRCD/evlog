import { os } from '@orpc/server'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { z } from 'zod'
import { initLogger, type EnrichContext } from 'evlog'
import { evlog, useLogger, withEvlog, type EvlogOrpcContext } from 'evlog/orpc'
import { createPostHogDrain } from 'evlog/posthog'
import { testUI } from './ui'

initLogger({
  env: { service: 'orpc-example' },
  pretty: true,
})

const errors = {
  PAYMENT_DECLINED: {
    status: 402,
    message: 'Payment declined',
    data: z.object({
      reason: z.enum(['insufficient_funds', 'card_expired', 'fraud_suspected']),
      retryable: z.boolean(),
    }),
  },
  USER_NOT_FOUND: {
    status: 404,
    message: 'User not found',
    data: z.object({ userId: z.string() }),
  },
  FORBIDDEN: {
    status: 403,
    message: 'Forbidden',
    data: z.object({ requiredRole: z.string() }),
  },
} as const

const base = os
  .$context<EvlogOrpcContext>()
  .errors(errors)
  .use(evlog())

type Role = 'guest' | 'admin' | 'superadmin'

interface AuthedUser {
  id: string
  name: string
  role: Role
  apiKey: string
}

const authed = base.use(async ({ context, next }) => {
  const user: AuthedUser = { id: 'u-1', name: 'Alice', role: 'admin', apiKey: 'demo' }
  context.log.set({ auth: { ok: true, userId: user.id, role: user.role } })
  return next({
    context: { ...context, user },
  })
})

function findUser(userId: string) {
  const log = useLogger()
  log.set({ user: { id: userId } })

  if (userId === 'unknown') return null

  const user = { id: userId, name: 'Alice', plan: 'pro' as const, email: 'alice@example.com' }
  const [local, domain] = user.email.split('@')
  log.set({ user: { name: user.name, plan: user.plan, email: `${local![0]}***@${domain}` } })
  return user
}

const usersRouter = {
  list: base
    .route({ method: 'GET', path: '/users', summary: 'List users (nested router demo)' })
    .handler(({ context }) => {
      const list = [
        { id: '42', name: 'Alice' },
        { id: '43', name: 'Bob' },
      ]
      context.log.set({ list: { count: list.length } })
      return { users: list }
    }),

  get: base
    .route({ method: 'GET', path: '/users/{id}', summary: 'Get user with input schema + masking' })
    .input(z.object({ id: z.string() }))
    .handler(({ input, errors }) => {
      const user = findUser(input.id)
      if (!user) {
        throw errors.USER_NOT_FOUND({ data: { userId: input.id } })
      }
      const orders = [{ id: 'order_1', total: 4999 }, { id: 'order_2', total: 1299 }]
      const log = useLogger()
      log.set({
        orders: {
          count: orders.length,
          totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
        },
      })
      return { user, orders }
    }),
}

const paymentsRouter = {
  charge: base
    .route({ method: 'POST', path: '/payments/charge', summary: 'Typed PAYMENT_DECLINED error' })
    .input(z.object({ amount: z.number().int().positive() }))
    .handler(({ input, context, errors }) => {
      context.log.set({ payment: { amount: input.amount } })
      throw errors.PAYMENT_DECLINED({
        data: { reason: 'insufficient_funds', retryable: true },
      })
    }),
}

const adminRouter = {
  delete: authed
    .route({ method: 'DELETE', path: '/admin/danger/{id}', summary: 'Auth middleware injects context.user' })
    .input(z.object({ id: z.string() }))
    .handler(({ input, context, errors }) => {
      if (context.user.role !== 'superadmin') {
        throw errors.FORBIDDEN({ data: { requiredRole: 'superadmin' } })
      }
      context.log.set({ deletedId: input.id, by: context.user.id })
      return { ok: true }
    }),
}

const router = {
  health: base
    .route({ method: 'GET', path: '/health', summary: 'Basic health check' })
    .handler(({ context }) => {
      context.log.set({ route: 'health' })
      return { ok: true }
    }),

  users: usersRouter,
  payments: paymentsRouter,
  admin: adminRouter,
}

const handler = withEvlog(
  new OpenAPIHandler<EvlogOrpcContext>(router),
  {
    drain: createPostHogDrain(),
    enrich: (ctx: EnrichContext) => {
      ctx.event.runtime = 'bun'
      ctx.event.pid = process.pid
    },
    keep: (ctx) => {
      // Force-keep slow requests in tail sampling
      if (ctx.duration && ctx.duration > 1000) ctx.shouldKeep = true
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
