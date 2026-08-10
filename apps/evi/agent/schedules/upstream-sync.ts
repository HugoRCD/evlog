import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'
import { MAINTAINER_PHONE } from '../lib/trust'

export default defineSchedule({
  // Twice a week, Monday and Thursday, 07:00 UTC. Later than the digest so
  // the two never contend for the thread at the same moment.
  cron: '0 7 * * 1,4',
  // eslint-disable-next-line require-await
  async run({ receive, waitUntil, appAuth }) {
    if (MAINTAINER_PHONE === undefined) {
      throw new Error('MAINTAINER_PHONE is required for the upstream-sync schedule.')
    }
    waitUntil(
      receive(photon, {
        message:
          'Load the upstream-sync skill and check the eve and Vercel Connect ecosystem for updates. Open draft PRs for anything warranted. This scheduled turn resumes a long-lived thread: ignore earlier conversation topics and stale pending requests, and do only this task.',
        // Spectrum direct-chat guid: `any;-;<address>`, so the thread is
        // derived from the phone number instead of a captured thread id.
        target: { adapterName: 'imessage', threadId: `imessage:any;-;${MAINTAINER_PHONE}` },
        auth: appAuth,
      }),
    )
  },
})
