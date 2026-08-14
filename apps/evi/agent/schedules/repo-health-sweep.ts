import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'
import { MAINTAINER_PHONE } from '../lib/trust'

export default defineSchedule({
  // Twice a week, Tuesday and Friday, 08:00 UTC: clear of the digest (05:00),
  // upstream-sync (Mon/Thu 07:00), cost-watchdog (Mon 08:00) and self-review
  // (Wed 08:00), so the scheduled turns never contend for the thread.
  cron: '0 8 * * 2,5',
  // eslint-disable-next-line require-await
  async run({ to, waitUntil, appAuth }) {
    if (MAINTAINER_PHONE === undefined) {
      throw new Error('MAINTAINER_PHONE is required for the repo-health-sweep schedule.')
    }
    waitUntil(
      to(photon, {
        // Spectrum direct-chat guid: `any;-;<address>`, so the thread is
        // derived from the phone number instead of a captured thread id.
        adapterName: 'imessage',
        threadId: `imessage:any;-;${MAINTAINER_PHONE}`,
      }).send(
        'Load the repo-health-sweep skill and run the full sweep over the repository: skills vs reality, docs quality, convention drift, and examples drift. Verify every claim against source on main, then deliver one report with concrete findings, each citing the file and the rule or source it contradicts, plus proposed diffs for the easy ones. Open draft PRs for the mechanical fixes and Linear issues for the findings that need a decision. This scheduled turn resumes a long-lived thread: ignore earlier conversation topics and stale pending requests, and do only this task.',
        { auth: appAuth },
      ),
    )
  },
})
