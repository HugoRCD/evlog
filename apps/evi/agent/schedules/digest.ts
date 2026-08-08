import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'
import { MAINTAINER_PHONE } from '../lib/trust'

export default defineSchedule({
  // Vercel evaluates cron in UTC: 0 6 is 08:00 Paris in summer (CEST) and
  // drifts to 07:00 in winter (CET).
  cron: '0 6 * * *',
  // eslint-disable-next-line require-await
  async run({ receive, waitUntil, appAuth }) {
    if (MAINTAINER_PHONE === undefined) {
      throw new Error('MAINTAINER_PHONE is required for the morning digest schedule.')
    }
    waitUntil(
      receive(photon, {
        message:
          'Post the morning digest to this thread: GitHub issues, pull requests and CI failures from the last 24 hours, most attention-worthy first, at most 10 lines. Read-only: do not modify anything.',
        // Spectrum direct-chat guid: `any;-;<address>`, so the thread is
        // derived from the phone number instead of a captured thread id.
        target: { adapterName: 'imessage', threadId: `imessage:any;-;${MAINTAINER_PHONE}` },
        auth: appAuth,
      }),
    )
  },
})
