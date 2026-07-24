import { useLogger } from 'evlog'

export async function POST() {
  const log = useLogger()
  log.set({ user: { id: '123' } })
  log.audit({ action: 'checkout.completed' })
  return Response.json({ ok: true })
}
