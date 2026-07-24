export default defineTask({
  meta: { name: 'cleanup', description: 'Daily cleanup' },
  run() {
    return { result: 'ok' }
  },
})
