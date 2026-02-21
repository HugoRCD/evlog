import { createFileRoute } from '@tanstack/react-router'
import { useRequest } from 'nitro/context'
import { createError } from 'evlog'
import type { RequestLogger } from 'evlog'

export const Route = createFileRoute('/api/admin')({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        const req = useRequest()
        const log = req.context.log as RequestLogger

        const body = await request.json() as { resourceId: string, changes: Record<string, unknown> }

        log.set({
          user: { id: 'user_456', role: 'member' },
          action: 'update_resource',
          resource: { id: body.resourceId, changes: Object.keys(body.changes) },
        })

        await new Promise(resolve => setTimeout(resolve, 100))
        log.set({ validation: { passed: true, checks: ['schema', 'constraints'] } })

        await new Promise(resolve => setTimeout(resolve, 80))
        log.set({ permissions: { checked: true, hasUpdate: false, requiredRole: 'admin' } })

        throw createError({
          message: 'Insufficient permissions',
          status: 403,
          why: 'Role "member" cannot update resources — requires "admin" role',
          fix: 'Request admin privileges from your team lead or contact support',
          link: 'https://docs.example.com/permissions/roles',
        })
      },
    },
  },
})
