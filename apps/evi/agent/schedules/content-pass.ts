import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'
import { MAINTAINER_PHONE } from '../lib/trust'

export default defineSchedule({
  // Daily, 06:00 UTC: after the digest (05:00) and before upstream-sync
  // (07:00), cost-watchdog (Mon 08:00) and self-review (Wed 08:00), so the five
  // scheduled turns never contend for the thread. Vercel evaluates cron in UTC.
  cron: '0 6 * * *',
  // eslint-disable-next-line require-await
  async run({ to, waitUntil, appAuth }) {
    if (MAINTAINER_PHONE === undefined) {
      throw new Error('MAINTAINER_PHONE is required for the content-pass schedule.')
    }
    waitUntil(
      to(photon, {
        // Spectrum direct-chat guid: `any;-;<address>`, so the thread is
        // derived from the phone number instead of a captured thread id.
        adapterName: 'imessage',
        threadId: `imessage:any;-;${MAINTAINER_PHONE}`,
      }).send(
        'Load the content-pass skill and run one pass over the written corpus: the docs, the landing, the package READMEs, the skills, the AGENTS.md files. Open a single draft PR if anything held, and say so in one line either way. This scheduled turn resumes a long-lived thread: ignore earlier conversation topics and stale pending requests, and do only this task.',
        { auth: appAuth },
      ),
    )
  },
})
