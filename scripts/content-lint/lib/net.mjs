/**
 * Fetching a page nobody in this repository chose.
 *
 * `--url` is reachable by the content reviewer, so the address can come from a
 * model reading someone else's page. Inside a sandbox that shares a network
 * with anything, an unchecked fetch is a way to read a local service and print
 * what it returned. Every hop is resolved and checked against the private
 * ranges before it is followed, redirects included, and addresses are compared
 * numerically rather than by the text they were written as.
 *
 * What this does not stop: the name is resolved here and resolved again by
 * `fetch`, so a record that answers public on the first lookup and private on
 * the second still connects. Closing that needs a dispatcher with a pinned
 * lookup, which needs a dependency this script does not have. The check raises
 * the cost of reaching a local service; it is not a sandbox.
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
 * Classified numerically, never by the text it was written as. The same
 * destination has many spellings: `::ffff:7f00:1` and `0:0:0:0:0:ffff:127.0.0.1`
 * are both loopback, and `fe80::/10` runs to `febf`, which no prefix match on
 * `fe80` catches.
 *
 * @param {string} address
 * @returns {boolean}
 */
function isPrivateV6(address) {
  const hextets = expandV6(address.toLowerCase().replace(/^\[|\]$/g, ''))
  if (hextets === null) return true

  if (hextets.every(part => part === 0)) return true
  if (hextets.slice(0, 7).every(part => part === 0) && hextets[7] === 1) return true

  // v4-mapped and v4-compatible carry a v4 address and its reachability.
  if (hextets.slice(0, 5).every(part => part === 0) && (hextets[5] === 0xFFFF || hextets[5] === 0)) {
    const a = hextets[6] >> 8
    const b = hextets[6] & 0xFF
    const c = hextets[7] >> 8
    const d = hextets[7] & 0xFF
    return isPrivateV4(`${a}.${b}.${c}.${d}`)
  }

  const first = hextets[0]
  if ((first & 0xFE00) === 0xFC00) return true // fc00::/7, unique local
  if ((first & 0xFFC0) === 0xFE80) return true // fe80::/10, link local
  if ((first & 0xFF00) === 0xFF00) return true // ff00::/8, multicast
  return false
}

/**
 * An IPv6 address as eight numbers, or null when it cannot be read as one.
 *
 * @param {string} address
 * @returns {number[] | null}
 */
function expandV6(address) {
  const zone = address.split('%')[0]
  const trailingV4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(zone)
  let text = zone

  if (trailingV4) {
    const octets = trailingV4[1].split('.').map(Number)
    if (octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null
    const high = ((octets[0] << 8) | octets[1]).toString(16)
    const low = ((octets[2] << 8) | octets[3]).toString(16)
    text = `${zone.slice(0, trailingV4.index)}${high}:${low}`
  }

  const [head, tail, ...rest] = text.split('::')
  if (rest.length > 0) return null

  const left = head === '' ? [] : head.split(':')
  const right = tail === undefined || tail === '' ? [] : tail.split(':')
  const missing = 8 - left.length - right.length
  if (tail === undefined ? missing !== 0 : missing < 0) return null

  const parts = [...left, ...Array.from({ length: tail === undefined ? 0 : missing }, () => '0'), ...right]
  if (parts.length !== 8) return null

  const hextets = parts.map(part => Number.parseInt(part, 16))
  return hextets.some(part => !Number.isInteger(part) || part < 0 || part > 0xFFFF) ? null : hextets
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
