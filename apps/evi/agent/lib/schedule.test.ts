import type { SlackChannel } from 'eve/channels/slack'
import type { ScheduleHandlerArgs } from 'eve/schedules'
import type { SessionAuthContext } from 'eve/context'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const channel = { __kind: 'eve:channel' } as unknown as SlackChannel

const appAuth: SessionAuthContext = {
  attributes: {},
  authenticator: 'app',
  principalId: 'eve:app',
  principalType: 'runtime',
}

function scheduleArgs() {
  const send = vi.fn().mockResolvedValue({ id: 'sess_123' })
  const to = vi.fn().mockReturnValue({ send })
  const waitUntil = vi.fn()
  return { args: { to, waitUntil, appAuth } as unknown as ScheduleHandlerArgs, send, to, waitUntil }
}

async function loadSchedule(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return await import('./schedule')
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

describe('maintainerRun', () => {
  it('sends the task to the configured channel under a fresh anchor, as the app principal', async () => {
    const { maintainerRun } = await loadSchedule({ EVI_SLACK_CHANNEL_ID: 'C0123', EVI_SLACK_TEAM_ID: 'T0123' })
    const { args, send, to, waitUntil } = scheduleArgs()

    maintainerRun(channel, 'Daily digest', 'Load the daily-digest skill and follow it.')(args)

    expect(to).toHaveBeenCalledWith(channel, expect.objectContaining({
      channelId: 'C0123',
      installationTeamId: 'T0123',
      initialMessage: expect.objectContaining({ card: expect.objectContaining({ title: 'Daily digest' }) }),
    }))
    expect(to.mock.calls[0]![1]).not.toHaveProperty('threadTs')
    expect(send).toHaveBeenCalledWith('Load the daily-digest skill and follow it.', { auth: appAuth })
    expect(waitUntil).toHaveBeenCalledTimes(1)
  })

  it('logs the accepted send with its session id', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { maintainerRun } = await loadSchedule({ EVI_SLACK_CHANNEL_ID: 'C0123' })
    const { args, waitUntil } = scheduleArgs()

    maintainerRun(channel, 'Daily digest', 'anything')(args)
    await waitUntil.mock.calls[0]![0]

    expect(log).toHaveBeenCalledWith('[schedule] send accepted, session sess_123')
    log.mockRestore()
  })

  it('logs and rethrows when the send fails, so the task still settles as failed', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { maintainerRun } = await loadSchedule({ EVI_SLACK_CHANNEL_ID: 'C0123' })
    const { args, send, waitUntil } = scheduleArgs()
    const failure = new Error('handoff refused')
    send.mockRejectedValue(failure)

    maintainerRun(channel, 'Daily digest', 'anything')(args)

    await expect(waitUntil.mock.calls[0]![0]).rejects.toThrow('handoff refused')
    expect(error).toHaveBeenCalledWith('[schedule] send failed', failure)
    error.mockRestore()
  })

  it('throws when the Slack channel is missing or empty', async () => {
    for (const channelId of [undefined, '']) {
      const { maintainerRun } = await loadSchedule({ EVI_SLACK_CHANNEL_ID: channelId })
      const { args } = scheduleArgs()
      expect(() => maintainerRun(channel, 'Daily digest', 'anything')(args)).toThrow('EVI_SLACK_CHANNEL_ID')
    }
  })
})
