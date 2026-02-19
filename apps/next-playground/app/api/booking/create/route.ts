import { withEvlog, useLogger } from '@/lib/evlog'

export const POST = withEvlog(async () => {
  const log = useLogger()

  log.set({
    booking: {
      id: 'booking_789',
      date: '2026-02-10',
      seats: 2,
    },
    action: 'create_booking',
  })

  return Response.json({
    success: true,
    bookingId: 'booking_789',
  })
})
