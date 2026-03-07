import { json } from '@sveltejs/kit'
import { useLogger } from 'evlog/sveltekit'
import type { RequestHandler } from './$types'

function findUserWithOrders(userId: string) {
  const log = useLogger()

  log.set({ user: { id: userId } })
  const user = { id: userId, name: 'Alice', plan: 'pro', email: 'alice@example.com' }

  const [local, domain] = user.email.split('@')
  log.set({ user: { name: user.name, plan: user.plan, email: `${local[0]}***@${domain}` } })

  const orders = [{ id: 'order_1', total: 4999 }, { id: 'order_2', total: 1299 }]
  log.set({ orders: { count: orders.length, totalRevenue: orders.reduce((sum, o) => sum + o.total, 0) } })

  return { user, orders }
}

export const GET: RequestHandler = ({ params }) => {
  const result = findUserWithOrders(params.id)
  return json(result)
}
