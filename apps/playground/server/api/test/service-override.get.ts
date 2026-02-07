export default defineEventHandler((event) => {
  const log = useLogger(event, 'custom-service')

  log.set({
    action: 'test_service_override',
    message: 'This log should have service: custom-service',
  })

  return {
    success: true,
    message: 'Service override test',
  }
})
