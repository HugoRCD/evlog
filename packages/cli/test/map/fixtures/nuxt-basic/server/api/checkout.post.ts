export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  log.set({ user: { id: '123' } })
  log.audit({ action: 'checkout.completed', resource: 'order' })
  return { ok: true }
})
