import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'
import { MAINTAINER_PHONE } from '../lib/trust'

export default defineSchedule({
  // Weekly, Monday 08:00 UTC: after the daily digest (05:00) and the
  // upstream-sync Monday run (07:00), and clear of self-review (Wed 08:00), so
  // the four scheduled turns never contend for the thread. Monday keeps the
  // report aligned to complete calendar weeks. Vercel evaluates cron in UTC.
  cron: '0 8 * * 1',
  // eslint-disable-next-line require-await
  async run({ to, waitUntil, appAuth }) {
    if (MAINTAINER_PHONE === undefined) {
      throw new Error('MAINTAINER_PHONE is required for the cost-watchdog schedule.')
    }
    waitUntil(
      to(photon, {
        // Spectrum direct-chat guid: `any;-;<address>`, so the thread is
        // derived from the phone number instead of a captured thread id.
        adapterName: 'imessage',
        threadId: `imessage:any;-;${MAINTAINER_PHONE}`,
      }).send(
        'Load the cost-watchdog skill and run the weekly cost and model review for the last full week: pull the gateway spend by surface and model, flag drift against the previous week, check the current model landscape, and propose per-surface model adjustments (or state clearly there is nothing to improve). Write the report as a Linear document and post the top finding with the link here. This scheduled turn resumes a long-lived thread: ignore earlier conversation topics and stale pending requests, and do only this task.',
        { auth: appAuth },
      ),
    )
  },
})
