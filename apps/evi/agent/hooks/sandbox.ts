import { defineHook } from 'eve/hooks'
import { prewarmSandbox } from '../lib/sandbox-prewarm'

export default defineHook({
  events: {
    'turn.started': (_event, ctx) => prewarmSandbox(ctx),
  },
})
