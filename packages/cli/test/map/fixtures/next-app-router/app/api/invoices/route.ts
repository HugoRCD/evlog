import { useLogger } from '@/lib/evlog'

export async function POST(request: Request) {
  const log = useLogger()
  log.set({ invoice: { id: '1' } })
  return Response.json({ ok: true })
}
