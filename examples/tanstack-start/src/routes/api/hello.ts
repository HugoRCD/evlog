import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { requireRequestLogger } from '@/utils/require-request-logger'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: async () => {
        const req = useRequest()
        const log = requireRequestLogger(req?.context)

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
