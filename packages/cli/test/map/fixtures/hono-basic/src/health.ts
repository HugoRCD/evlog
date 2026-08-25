import { Hono } from 'hono'

const health = new Hono()

health.get('/health', c => c.json({ ok: true }))

export default health
