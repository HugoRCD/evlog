import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import type { RequestLogger } from 'evlog'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: async () => {
        const req = useRequest()
        const log = req?.context?.log as RequestLogger

        log.set({
          user: { id: 'user_789', plan: 'enterprise', role: 'admin' },
        })

        await new Promise(resolve => setTimeout(resolve, 80))
        log.set({ action: 'fetch_profile', cache: { hit: true, ttl: 3600 } })

        return Response.json({
          success: true,
          user: { id: 'user_789', name: 'John Doe', email: 'john@example.com' },
        })
      },
    },
  },
})
