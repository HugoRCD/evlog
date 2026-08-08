import { defineSchedule } from 'eve/schedules'
import photon from '../channels/photon'

/**
 * Provider-native Photon thread id for the iMessage conversation the digest
 * lands in, kept out of the repo like the phone number in `lib/trust.ts`.
 */
const DIGEST_THREAD_ID = process.env.PHOTON_DIGEST_THREAD_ID

export default defineSchedule({
  // Vercel evaluates cron in UTC: 0 6 is 08:00 Paris in summer (CEST) and
  // drifts to 07:00 in winter (CET).
  cron: '0 6 * * *',
  async run({ receive, waitUntil, appAuth }) {
    if (DIGEST_THREAD_ID === undefined) {
      throw new Error('PHOTON_DIGEST_THREAD_ID is required for the morning digest schedule.')
    }
    waitUntil(
      receive(photon, {
        message:
          'Post the morning digest to this thread: GitHub issues, pull requests and CI failures from the last 24 hours, most attention-worthy first, at most 10 lines. Read-only: do not modify anything.',
        target: { adapterName: 'imessage', threadId: DIGEST_THREAD_ID },
        auth: appAuth,
      }),
    )
  },
})
