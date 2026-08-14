/**
 * Fetching a page nobody in this repository chose.
 *
 * `--url` is reachable by the content reviewer, so the address can come from a
 * model reading someone else's page. Inside a sandbox that shares a network
 * with anything, an unchecked fetch is a way to read a local service and print
 * what it returned. Every hop is resolved and checked against the private
 * ranges before it is followed, redirects included: a public hostname that
 * resolves to loopback, or a 302 into the metadata endpoint, is the whole
 * attack.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_REDIRECTS = 5

/** Hosts that never resolve anywhere useful to a scanner. */
const BLOCKED_NAMES = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i

/**
 * @param {string} address
 * @returns {boolean}
 */
export function isPrivateAddress(address) {
  const version = isIP(address)
  if (version === 4) return isPrivateV4(address)
  if (version === 6) return isPrivateV6(address)
  return true
}

/**
 * @param {string} address
 * @returns {boolean}
 */
function isPrivateV4(address) {
  const [a, b] = address.split('.').map(Number)
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return a >= 224
}

/**
 * @param {string} address
 * @returns {boolean}
 */
function isPrivateV6(address) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized === '::' || normalized === '::1') return true
  // v4-mapped (::ffff:127.0.0.1) carries a v4 address and its reachability.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)
  if (mapped) return isPrivateV4(mapped[1])
  return /^(fc|fd|fe80|ff)/.test(normalized)
}

/**
 * Resolve a hostname and refuse it when any address it answers with is
 * private. Every address, not the first: a name that answers with one public
 * and one loopback address is the same attack with a retry.
 *
 * @param {string} hostname
 * @returns {Promise<string | null>} The reason to refuse, or null.
 */
export async function refuseHost(hostname) {
  const bare = hostname.replace(/^\[|\]$/g, '')
  if (BLOCKED_NAMES.test(bare)) return `${hostname} is a local name`
  if (isIP(bare) !== 0) return isPrivateAddress(bare) ? `${hostname} is a private address` : null

  let addresses
  try {
    addresses = await lookup(bare, { all: true })
  } catch {
    return `${hostname} does not resolve`
  }

  const priv = addresses.filter(entry => isPrivateAddress(entry.address))
  return priv.length > 0 ? `${hostname} resolves to the private address ${priv[0].address}` : null
}

/**
 * Fetch, following redirects by hand so each hop is checked before it is taken.
 *
 * @param {string} url
 * @param {{ timeoutMs: number, userAgent: string }} options
 * @returns {Promise<{ response: Response } | { error: string }>}
 */
export async function fetchPublic(url, options) {
  let current = url

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let parsed
    try {
      parsed = new URL(current)
    } catch {
      return { error: `${current} is not a URL` }
    }
    if (!/^https?:$/.test(parsed.protocol)) return { error: `${current} is not http or https` }

    const refusal = await refuseHost(parsed.hostname)
    if (refusal !== null) return { error: refusal }

    let response
    try {
      response = await fetch(current, {
        headers: { 'user-agent': options.userAgent },
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs),
      })
    } catch (error) {
      return { error: `${current} could not be fetched: ${error instanceof Error ? error.message : String(error)}` }
    }

    if (response.status < 300 || response.status > 399) return { response }

    const location = response.headers.get('location')
    if (location === null) return { response }
    current = new URL(location, current).toString()
  }

  return { error: `${url} redirected more than ${MAX_REDIRECTS} times` }
}
