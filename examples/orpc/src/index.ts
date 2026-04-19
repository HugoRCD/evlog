import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/node'
import express from 'express'
import { initLogger, type RequestLogger } from 'evlog'
import { evlog } from 'evlog/express'
import { createEvlogContext, createEvlogMiddleware, useLogger } from 'evlog/orpc'
import { createHttpDrain } from './drain'
import { testUI } from './ui'
import { z } from 'zod'

initLogger({
  env: { service: 'orpc-example' },
  pretty: true,
  drain: createHttpDrain({
    url: 'http://localhost:8080/ingest',
    token: process.env.ORPC_EXAMPLE_LOG_TOKEN || 'demo-token',
  }),
})

type Context = { role: string; log: RequestLogger }
const base = os.$context<Context>().use(createEvlogMiddleware())

function findUser(id: string) {
  const log = useLogger()
  log.set({ userId: id })

  if (id === 'error') {
    throw new Error('User not found')
  }

  return { id, name: 'Alice', plan: 'pro' }
}

const appRouter = {
  user: {
    getById: base
      .input(z.object({ id: z.string() }))
      .handler(({ input }) => findUser(input.id)),
  },
  post: {
    create: base
      .input(z.object({ title: z.string(), body: z.string() }))
      .handler(({ input, context }) => {
        context.log.set({ post: { title: input.title } })
        return { id: 'post_1', ...input }
      }),
  },
  health: {
    check: base.handler(() => ({ ok: true })),
  },
  batch: {
    test: base
      .input(z.object({ count: z.number().min(1).max(10) }))
      .handler(({ input, context }) => {
        context.log.set({ batchSize: input.count })
        const results = []
        for (let i = 0; i < input.count; i++) {
          results.push({ id: i, name: `Item ${i}`, timestamp: Date.now() })
        }
        return results
      }),
  },
}

const rpcHandler = new RPCHandler(appRouter)

const app = express()
app.get('/', (_req, res) => res.type('html').send(testUI()))
app.use(evlog())
app.use('/rpc', async (req, res) => {
  const { matched } = await rpcHandler.handle(req, res, {
    prefix: '/rpc',
    context: createEvlogContext(req, { role: 'user' }),
  })
  if (!matched) res.status(404).end('Not found')
})

app.listen(3000, () => console.log('oRPC server started on http://localhost:3000'))
