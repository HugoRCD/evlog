import { describe, expect, it } from 'vitest'
import { channelName } from './channel'

describe('channelName', () => {
  it('strips the authored-channel prefix', () => {
    expect(channelName('channel:github')).toBe('github')
    expect(channelName('channel:photon')).toBe('photon')
  })

  it('passes framework channels through bare', () => {
    expect(channelName('http')).toBe('http')
    expect(channelName('schedule')).toBe('schedule')
  })

  it('falls back to unknown without a kind', () => {
    expect(channelName(undefined)).toBe('unknown')
  })
})
