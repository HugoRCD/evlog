import { describe, expect, it } from 'vitest'
import { isPrivateAddress, refuseHost } from './net.mjs'

describe('isPrivateAddress', () => {
  it('refuses every range a scanner has no business reaching', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })

  it('allows a public address', () => {
    for (const address of ['93.184.216.34', '1.1.1.1', '172.32.0.1', '2606:4700::1111']) {
      expect(isPrivateAddress(address), address).toBe(false)
    }
  })

  it('refuses anything that is not an address at all', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true)
  })
})

describe('refuseHost', () => {
  it('names the local hosts without resolving them', async () => {
    expect(await refuseHost('localhost')).toMatch(/local name/)
    expect(await refuseHost('foo.internal')).toMatch(/local name/)
    expect(await refuseHost('metadata.google.internal')).toMatch(/local name/)
  })

  it('refuses a literal private address', async () => {
    expect(await refuseHost('169.254.169.254')).toMatch(/private address/)
    expect(await refuseHost('[::1]')).toMatch(/private address/)
  })

  it('accepts a literal public address', async () => {
    expect(await refuseHost('1.1.1.1')).toBeNull()
  })

  it('refuses a name that does not resolve', async () => {
    expect(await refuseHost('nothing.invalid')).toMatch(/does not resolve/)
  })
})
