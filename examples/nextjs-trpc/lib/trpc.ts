import { initTRPC, TRPCError } from '@trpc/server'
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
  checkout: t.router({
    process: loggedProcedure
      .input(z.object({ amount: z.number(), apiKey: z.string() }))
      .mutation(({ input, ctx }) => {
        ctx.log.set({ paymentAmount: input.amount, apiKey: input.apiKey })
        if (input.amount > 1000) {
          throw new TRPCError({ code: 'PAYLOAD_TOO_LARGE', message: 'Amount exceeds maximum limit' })
        }
        return { success: true }
      }),
  }),
  health: t.router({
    check: loggedProcedure.query(() => ({ ok: true })),
  }),
})

export type AppRouter = typeof appRouter
