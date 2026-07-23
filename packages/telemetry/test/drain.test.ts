import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpDrain } from '../src/drain'
import { exampleRunEvent } from '../src/disclosure'

function mockFetch(status: number): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))
}

describe('createHttpDrain', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports delivered (drop from outbox) on a 2xx response', async () => {
    mockFetch(204)
    const drain = createHttpDrain('http://example.test/ingest')
    await expect(drain([exampleRunEvent()])).resolves.toBe(true)
  })

  it('drops permanently-rejected batches on 400 instead of retrying forever', async () => {
    // The exact failure mode this guards: a stale/oversized outbox batch
    // that will never become valid by resending the same bytes — without
    // this, it would block all future telemetry for the tool indefinitely.
    mockFetch(400)
    const drain = createHttpDrain('http://example.test/ingest')
    await expect(drain([exampleRunEvent()])).resolves.toBe(true)
  })

  it('keeps retrying on 429 (rate limited)', async () => {
    mockFetch(429)
    const drain = createHttpDrain('http://example.test/ingest')
    await expect(drain([exampleRunEvent()])).resolves.toBe(false)
  })

  it('keeps retrying on a 5xx server error', async () => {
    mockFetch(500)
    const drain = createHttpDrain('http://example.test/ingest')
    await expect(drain([exampleRunEvent()])).resolves.toBe(false)
  })

  it('keeps retrying on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const drain = createHttpDrain('http://example.test/ingest')
    await expect(drain([exampleRunEvent()])).resolves.toBe(false)
  })

  it('short-circuits on an empty batch without calling fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const drain = createHttpDrain('http://example.test/ingest')
    await expect(drain([])).resolves.toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
