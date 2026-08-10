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
        message: 'Load the daily-digest skill and follow it for the last 24 hours. This scheduled turn resumes a long-lived thread: ignore earlier conversation topics and stale pending requests, and do only this task.',
        // Spectrum direct-chat guid: `any;-;<address>`, so the thread is
        // derived from the phone number instead of a captured thread id.
        target: { adapterName: 'imessage', threadId: `imessage:any;-;${MAINTAINER_PHONE}` },
        auth: appAuth,
      }),
    )
  },
})
