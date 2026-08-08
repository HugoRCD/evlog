import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'
import { MAINTAINER_PHONE } from '../lib/trust'

export default defineSchedule({
  // Vercel evaluates cron in UTC: 0 5 is 06:00 London in summer (BST) and
  // drifts to 05:00 in winter (GMT).
  cron: '0 5 * * *',
  // eslint-disable-next-line require-await
  async run({ receive, waitUntil, appAuth }) {
    if (MAINTAINER_PHONE === undefined) {
      throw new Error('MAINTAINER_PHONE is required for the morning digest schedule.')
    }
    waitUntil(
      receive(photon, {
        message:
          'Post the morning digest to this thread: GitHub issues, pull requests and CI failures from the last 24 hours, most attention-worthy first, at most 10 lines. Then AI Gateway spend for the last 24 hours (ai_gateway__report). Then 2-3 short items of news or updates worth reading today. Read-only: do not modify anything.',
        // Spectrum direct-chat guid: `any;-;<address>`, so the thread is
        // derived from the phone number instead of a captured thread id.
        target: { adapterName: 'imessage', threadId: `imessage:any;-;${MAINTAINER_PHONE}` },
        auth: appAuth,
      }),
    )
  },
})
