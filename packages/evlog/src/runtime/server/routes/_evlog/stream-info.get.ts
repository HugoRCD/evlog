import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defineEventHandler, setResponseHeaders } from 'h3'

/**
 * Discovery endpoint for the local evlog stream server. Reads
 * `<cwd>/.evlog/stream.url` and returns the URL so a browser tab (or any
 * other consumer that reaches the user's HTTP server) can find the
 * mini-server's port without hard-coding it.
 *
 * Returns `{ url: null }` when the stream server isn't running — the
 * consumer should treat that as "not available" and not error.
 */
export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  })

  try {
    const path = join(process.cwd(), '.evlog', 'stream.url')
    const url = (await readFile(path, 'utf-8')).trim()
    return { url: url || null }
  } catch {
    return { url: null }
  }
})
