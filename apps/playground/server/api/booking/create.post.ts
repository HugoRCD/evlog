export default defineEventHandler((event) => {
  const log = useLogger(event)

  log.set({
    booking: {
      id: 'booking_789',
      date: '2026-02-10',
      seats: 2,
    },
    action: 'create_booking',
  })

  return {
    success: true,
    bookingId: 'booking_789',
  }
})
