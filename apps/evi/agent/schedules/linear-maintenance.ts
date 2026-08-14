import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'
import { MAINTAINER_PHONE } from '../lib/trust'

export default defineSchedule({
  // Weekly, Thursday 08:00 UTC: the only 08:00 slot left clear (digest 05:00,
  // upstream-sync Mon/Thu 07:00, cost-watchdog Mon 08:00, repo-health-sweep
  // Tue/Fri 08:00, self-review Wed 08:00), so the scheduled turns never
  // contend for the thread. Bump to every other Thursday if the pass proves
  // lighter than expected.
  cron: '0 8 * * 4',
  // eslint-disable-next-line require-await
  async run({ to, waitUntil, appAuth }) {
    if (MAINTAINER_PHONE === undefined) {
      throw new Error('MAINTAINER_PHONE is required for the linear-maintenance schedule.')
    }
    waitUntil(
      to(photon, {
        // Spectrum direct-chat guid: `any;-;<address>`, so the thread is
        // derived from the phone number instead of a captured thread id.
        adapterName: 'imessage',
        threadId: `imessage:any;-;${MAINTAINER_PHONE}`,
      }).send(
        'Load the linear-maintenance skill and run the pass over the evlog team Linear backlog: apply the mechanically verifiable fixes for project, priority and label drift, close anything provably shipped, and surface the rest as decisions. Deliver one report as a Linear document with the applied fixes and the open decisions, and post one line per artifact to the thread. This scheduled turn resumes a long-lived thread: ignore earlier conversation topics and stale pending requests, and do only this task.',
        { auth: appAuth },
      ),
    )
  },
})
