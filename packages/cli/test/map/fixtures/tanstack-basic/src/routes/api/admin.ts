import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/admin')({
  server: {
    handlers: {
      POST: async () => {
        try {
          await fetch('/api/auth')
        }
        catch {}
        return { ok: true }
      },
    },
  },
})
