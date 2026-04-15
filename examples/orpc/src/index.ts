import { os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/node'
import express from 'express'
import { initLogger, type RequestLogger } from 'evlog'
import { evlog } from 'evlog/express'
import { createEvlogContext, createEvlogMiddleware, useLogger } from 'evlog/orpc'
import { z } from 'zod'

initLogger({ env: { service: 'orpc-example' }, pretty: true })

type Context = { role: string; log: RequestLogger }
const base = os.$context<Context>().use(createEvlogMiddleware())

function findUser(id: string) {
  const log = useLogger()
  log.set({ userId: id })
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
}

const rpcHandler = new RPCHandler(appRouter)

const app = express()
app.use(evlog())
app.use('/rpc', async (req, res) => {
  const { matched } = await rpcHandler.handle(req, res, {
    prefix: '/rpc',
    context: createEvlogContext(req, { role: 'user' }),
  })
  if (!matched) res.status(404).end('Not found')
})

app.listen(3000, () => console.log('oRPC server started on http://localhost:3000'))
