import { loggerContext, useLogger } from 'evlog/react-router'
import type { Route } from './+types/users.$id'

async function fetchUserOrders(userId: string) {
  const log = useLogger()
  log.set({ db: { query: 'fetchUserOrders', userId } })
  return [{ id: 'order_1', total: 4999 }, { id: 'order_2', total: 1299 }]
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const log = context.get(loggerContext)
  const userId = params.id

  log.set({ user: { id: userId } })
  const user = { id: userId, name: 'Alice', plan: 'pro', email: 'alice@example.com' }

  const [local, domain] = user.email.split('@')
  log.set({ user: { name: user.name, plan: user.plan, email: `${local[0]}***@${domain}` } })

  const orders = await fetchUserOrders(userId)
  log.set({ orders: { count: orders.length, totalRevenue: orders.reduce((sum, o) => sum + o.total, 0) } })

  return Response.json({ user, orders })
}
