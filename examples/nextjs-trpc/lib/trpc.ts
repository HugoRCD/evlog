import { initTRPC } from '@trpc/server'
import type { RequestLogger } from 'evlog'
import { useLogger as useHttpLogger } from 'evlog/next'
import { createEvlogMiddleware, useLogger } from 'evlog/trpc'
import { z } from 'zod'

// createContext runs before tRPC middleware — must use the HTTP-level logger from withEvlog()
type Context = { role: 'user'; log: RequestLogger }

export const createContext = async (): Promise<Context> => ({
  role: 'user',
  log: useHttpLogger(),
})

const t = initTRPC.context<Context>().create()
const loggedProcedure = t.procedure.use(createEvlogMiddleware())

function findUser(id: string) {
  const log = useLogger()
  log.set({ userId: id })
  return { id, name: 'Alice', plan: 'pro' }
}

export const appRouter = t.router({
  user: t.router({
    getById: loggedProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => findUser(input.id)),
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
    check: loggedProcedure.query(() => ({ ok: true })),
  }),
})

export type AppRouter = typeof appRouter
