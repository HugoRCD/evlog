import type { ChatSdkChannel } from 'eve/channels/chat-sdk'
import type { ScheduleHandlerArgs } from 'eve/schedules'
import type { SessionAuthContext } from 'eve/context'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const channel = { __kind: 'eve:channel' } as ChatSdkChannel

const appAuth: SessionAuthContext = {
  attributes: {},
  authenticator: 'app',
  principalId: 'eve:app',
  principalType: 'runtime',
}

function scheduleArgs() {
  const send = vi.fn().mockResolvedValue(undefined)
  const to = vi.fn().mockReturnValue({ send })
  const waitUntil = vi.fn()
  return { args: { to, waitUntil, appAuth } as unknown as ScheduleHandlerArgs, send, to, waitUntil }
}

async function loadSchedule(phone: string | undefined) {
  vi.resetModules()
  vi.stubEnv('MAINTAINER_PHONE', phone)
  return await import('./schedule')
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('maintainerRun', () => {
  it('sends the task with the shared epilogue to the derived thread, as the app principal', async () => {
    const { maintainerRun, SCHEDULED_TASK_EPILOGUE } = await loadSchedule('+33600000000')
    const { args, send, to, waitUntil } = scheduleArgs()

    maintainerRun(channel, 'Load the daily-digest skill and follow it.')(args)

    expect(to).toHaveBeenCalledWith(channel, {
      adapterName: 'imessage',
      threadId: 'imessage:any;-;+33600000000',
    })
    expect(send).toHaveBeenCalledWith(
      `Load the daily-digest skill and follow it. ${SCHEDULED_TASK_EPILOGUE}`,
      { auth: appAuth },
    )
    expect(waitUntil).toHaveBeenCalledTimes(1)
  })

  it('throws when no maintainer phone is configured', async () => {
    const { maintainerRun } = await loadSchedule(undefined)
    const { args } = scheduleArgs()

    expect(() => maintainerRun(channel, 'anything')(args)).toThrow('MAINTAINER_PHONE')
  })
})
