import { loggerContext } from 'evlog/react-router'
import type { Route } from './+types/health'

export async function loader({ context }: Route.LoaderArgs) {
  const log = context.get(loggerContext)
  log.set({ route: 'health' })
  return Response.json({ ok: true })
}
