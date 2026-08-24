import type { ChatSdkChannel } from 'eve/channels/chat-sdk'
import type { ScheduleRunHandler } from 'eve/schedules'
import { MAINTAINER_PHONE } from './trust'

/** Scheduled turns resume one long-lived thread; this keeps them on task. */
export const SCHEDULED_TASK_EPILOGUE
  = 'This scheduled turn resumes a long-lived thread: ignore earlier conversation topics and stale pending requests, and do only this task.'

/**
 * Run handler delivering a task to the maintainer's iMessage thread. The
 * Spectrum direct-chat guid is `any;-;<address>`, so the thread id derives
 * from the phone number and needs no capture. All schedules share this one
 * thread: keep their crons (UTC on Vercel) spaced so no two turns contend.
 */
export function maintainerRun(channel: ChatSdkChannel, task: string): ScheduleRunHandler {
  return ({ to, waitUntil, appAuth }) => {
    if (!MAINTAINER_PHONE) {
      throw new Error('MAINTAINER_PHONE is required for scheduled runs.')
    }
    waitUntil(
      to(channel, { adapterName: 'imessage', threadId: `imessage:any;-;${MAINTAINER_PHONE}` })
        .send(`${task} ${SCHEDULED_TASK_EPILOGUE}`, { auth: appAuth })
        .then(
          // A send has vanished without an error before (accepted with a 2xx
          // by a stale deployment, no turn, no log); record both outcomes so
          // the cron invocation always tells whether the handoff happened.
          (session) => console.log(`[schedule] send accepted, session ${session.id}`),
          (error) => {
            console.error('[schedule] send failed', error)
            throw error
          },
        ),
    )
  }
}
