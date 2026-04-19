import { initTRPC } from '@trpc/server'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import express from 'express'
import { initLogger } from 'evlog'
import { evlog } from 'evlog/express'
import { createEvlogMiddleware, createEvlogTRPCContext, useLogger } from 'evlog/trpc'
import { createHttpDrain } from './drain'
import { testUI } from './ui'
import { z } from 'zod'

initLogger({
  env: { service: 'trpc-example' },
  pretty: true,
  drain: createHttpDrain({
    url: 'http://localhost:8080/ingest',
    token: process.env.TRPC_EXAMPLE_LOG_TOKEN || 'demo-token',
  }),
})

const createContext = createEvlogTRPCContext(async () => ({
  role: 'user' as const,
}))
type Context = Awaited<ReturnType<typeof createContext>>

const t = initTRPC.context<Context>().create()
const loggedProcedure = t.procedure.use(createEvlogMiddleware())

function findUser(id: string) {
  const log = useLogger()
  log.set({ userId: id })

  if (id === 'error') {
    throw new Error('User not found')
  }

  return { id, name: 'Alice', plan: 'pro' }
}

const appRouter = t.router({
  user: t.router({
    getById: loggedProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => {
        return findUser(input.id)
      }),
  }),
  post: t.router({
    create: loggedProcedure
      .input(z.object({ title: z.string(), body: z.string() }))
      .mutation(({ input, ctx }) => {
        ctx.log.set({ post: { title: input.title } })
        return { id: 'post_1', ...input }
      }),
  }),
  health: t.router({
    check: loggedProcedure.query(() => {
      return { ok: true }
    }),
  }),
  batch: t.router({
    test: loggedProcedure
      .input(z.object({ count: z.number().min(1).max(10) }))
      .query(({ input, ctx }) => {
        ctx.log.set({ batchSize: input.count })
        const results = []
        for (let i = 0; i < input.count; i++) {
          results.push({ id: i, name: `Item ${i}`, timestamp: Date.now() })
        }
        return results
      }),
  }),
})

export type AppRouter = typeof appRouter

const app = express()
app.get('/', (_req, res) => res.type('html').send(testUI()))
app.use(evlog())
app.use('/trpc', createExpressMiddleware({ router: appRouter, createContext }))
app.listen(3000, () => console.log('tRPC server started on http://localhost:3000'))
