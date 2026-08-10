import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'
import { MAINTAINER_PHONE } from '../lib/trust'

export default defineSchedule({
  // Weekly, Wednesday 08:00 UTC: after the morning digest and between the two
  // upstream-sync runs, so the three never contend for the thread.
  cron: '0 8 * * 3',
  // eslint-disable-next-line require-await
  async run({ to, waitUntil, appAuth }) {
    if (MAINTAINER_PHONE === undefined) {
      throw new Error('MAINTAINER_PHONE is required for the self-review schedule.')
    }
    waitUntil(
      to(photon, {
        // Spectrum direct-chat guid: `any;-;<address>`, so the thread is
        // derived from the phone number instead of a captured thread id.
        adapterName: 'imessage',
        threadId: `imessage:any;-;${MAINTAINER_PHONE}`,
      }).send(
        'Load the self-review skill and run both halves over the repository and your own surface: what has drifted out of coherence, and what capability is missing. Open draft PRs for the mechanical fixes, and Linear issues for the findings and proposals that need a decision. This scheduled turn resumes a long-lived thread: ignore earlier conversation topics and stale pending requests, and do only this task.',
        { auth: appAuth },
      ),
    )
  },
})
