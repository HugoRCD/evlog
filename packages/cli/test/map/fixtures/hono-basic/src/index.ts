import { Hono } from 'hono'
import { evlog, type EvlogVariables } from 'evlog/hono'
import checkout from './checkout'
import health from './health'

const app = new Hono<EvlogVariables>()

app.use(evlog())
app.route('/', checkout)
app.route('/', health)

export default app
