import { loggerContext } from 'evlog/react-router'
import { createError } from 'evlog'
import type { Route } from './+types/checkout'

export async function loader({ context }: Route.LoaderArgs) {
  const log = context.get(loggerContext)
  log.set({ cart: { items: 3, total: 9999 } })

  throw createError({
    message: 'Payment failed',
    status: 402,
    why: 'Card declined by issuer',
    fix: 'Try a different card or payment method',
    link: 'https://docs.example.com/payments/declined',
  })
}
