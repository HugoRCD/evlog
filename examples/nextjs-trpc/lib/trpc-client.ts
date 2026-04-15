import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from './trpc'

export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc' })]
})
