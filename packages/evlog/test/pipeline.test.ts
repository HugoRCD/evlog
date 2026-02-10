import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrainContext } from '../src/types'
import { createDrainPipeline } from '../src/pipeline'

function createTestContext(id: number): DrainContext {
  return {
    event: {
      timestamp: '2024-01-01T00:00:00.000Z',
      level: 'info',
      service: 'test',
      environment: 'test',
      id,
    },
  }
}

describe('createDrainPipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('batching by size', () => {
    it('does not flush before batch size is reached', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline({ batch: { size: 3, intervalMs: 60000 } })(drain)

      hook(createTestContext(1))
      hook(createTestContext(2))

      await vi.advanceTimersByTimeAsync(0)
      expect(drain).not.toHaveBeenCalled()

      await hook.flush()
    })

    it('flushes when batch size is reached', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline({ batch: { size: 3, intervalMs: 60000 } })(drain)

      hook(createTestContext(1))
      hook(createTestContext(2))
      hook(createTestContext(3))

      await vi.runAllTimersAsync()

      expect(drain).toHaveBeenCalledTimes(1)
      const batch = drain.mock.calls[0]![0] as DrainContext[]
      expect(batch).toHaveLength(3)
      expect(batch[0]!.event.id).toBe(1)
      expect(batch[1]!.event.id).toBe(2)
      expect(batch[2]!.event.id).toBe(3)
    })

    it('splits into multiple batches', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline({ batch: { size: 3 } })(drain)

      for (let i = 1; i <= 7; i++) hook(createTestContext(i))

      await hook.flush()

      expect(drain).toHaveBeenCalledTimes(3)
      expect((drain.mock.calls[0]![0] as DrainContext[])).toHaveLength(3)
      expect((drain.mock.calls[1]![0] as DrainContext[])).toHaveLength(3)
      expect((drain.mock.calls[2]![0] as DrainContext[])).toHaveLength(1)
    })
  })

  describe('batching by interval', () => {
    it('flushes after interval expires', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline({ batch: { size: 100, intervalMs: 5000 } })(drain)

      hook(createTestContext(1))
      hook(createTestContext(2))

      await vi.advanceTimersByTimeAsync(4999)
      expect(drain).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(drain).toHaveBeenCalledTimes(1)
      expect((drain.mock.calls[0]![0] as DrainContext[])).toHaveLength(2)
    })

    it('resets interval when batch size is reached', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline({ batch: { size: 2, intervalMs: 5000 } })(drain)

      hook(createTestContext(1))
      hook(createTestContext(2))

      // Batch size reached, should flush immediately
      await vi.advanceTimersByTimeAsync(0)
      expect(drain).toHaveBeenCalledTimes(1)

      // Push one more - should start interval timer, not flush immediately
      hook(createTestContext(3))
      await vi.advanceTimersByTimeAsync(0)
      expect(drain).toHaveBeenCalledTimes(1)

      // Wait for interval
      await vi.advanceTimersByTimeAsync(5000)
      expect(drain).toHaveBeenCalledTimes(2)
    })
  })

  describe('retry', () => {
    it('retries on failure with exponential backoff', async () => {
      const drain = vi.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce(undefined)

      const hook = createDrainPipeline({
        batch: { size: 1 },
        retry: { maxAttempts: 3, backoff: 'exponential', initialDelayMs: 100, maxDelayMs: 10000 },
      })(drain)

      hook(createTestContext(1))

      // First attempt (immediate)
      await vi.advanceTimersByTimeAsync(0)
      expect(drain).toHaveBeenCalledTimes(1)

      // Wait for first retry delay (100ms * 2^0 = 100ms)
      await vi.advanceTimersByTimeAsync(100)
      expect(drain).toHaveBeenCalledTimes(2)

      // Wait for second retry delay (100ms * 2^1 = 200ms)
      await vi.advanceTimersByTimeAsync(200)
      expect(drain).toHaveBeenCalledTimes(3)
    })

    it('retries with linear backoff', async () => {
      const drain = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(undefined)

      const hook = createDrainPipeline({
        batch: { size: 1 },
        retry: { maxAttempts: 3, backoff: 'linear', initialDelayMs: 100 },
      })(drain)

      hook(createTestContext(1))

      await vi.advanceTimersByTimeAsync(0)
      expect(drain).toHaveBeenCalledTimes(1)

      // Linear: 100 * 1 = 100ms
      await vi.advanceTimersByTimeAsync(100)
      expect(drain).toHaveBeenCalledTimes(2)

      // Linear: 100 * 2 = 200ms
      await vi.advanceTimersByTimeAsync(200)
      expect(drain).toHaveBeenCalledTimes(3)
    })

    it('retries with fixed backoff', async () => {
      const drain = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(undefined)

      const hook = createDrainPipeline({
        batch: { size: 1 },
        retry: { maxAttempts: 2, backoff: 'fixed', initialDelayMs: 100 },
      })(drain)

      hook(createTestContext(1))

      await vi.advanceTimersByTimeAsync(0)
      expect(drain).toHaveBeenCalledTimes(1)

      // Fixed: always 100ms
      await vi.advanceTimersByTimeAsync(100)
      expect(drain).toHaveBeenCalledTimes(2)
    })

    it('caps retry delay at maxDelayMs', async () => {
      const drain = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(undefined)

      const hook = createDrainPipeline({
        batch: { size: 1 },
        retry: { maxAttempts: 2, backoff: 'exponential', initialDelayMs: 1000, maxDelayMs: 500 },
      })(drain)

      hook(createTestContext(1))

      await vi.advanceTimersByTimeAsync(0)
      expect(drain).toHaveBeenCalledTimes(1)

      // Exponential: 1000 * 2^0 = 1000ms, capped to 500ms
      await vi.advanceTimersByTimeAsync(500)
      expect(drain).toHaveBeenCalledTimes(2)
    })

    it('calls onDropped after all retries exhausted', async () => {
      const drain = vi.fn().mockRejectedValue(new Error('permanent failure'))
      const onDropped = vi.fn()

      const hook = createDrainPipeline({
        batch: { size: 1 },
        retry: { maxAttempts: 2, backoff: 'fixed', initialDelayMs: 50 },
        onDropped,
      })(drain)

      hook(createTestContext(1))

      await vi.runAllTimersAsync()

      expect(drain).toHaveBeenCalledTimes(2)
      expect(onDropped).toHaveBeenCalledTimes(1)
      expect((onDropped.mock.calls[0]![0] as DrainContext[])).toHaveLength(1)
      expect(onDropped.mock.calls[0]![1]).toBeInstanceOf(Error)
      expect((onDropped.mock.calls[0]![1] as Error).message).toBe('permanent failure')
    })
  })

  describe('buffer overflow', () => {
    it('drops oldest events and calls onDropped when buffer is full', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const onDropped = vi.fn()

      const hook = createDrainPipeline({
        batch: { size: 100, intervalMs: 60000 },
        maxBufferSize: 3,
        onDropped,
      })(drain)

      hook(createTestContext(1))
      hook(createTestContext(2))
      hook(createTestContext(3))
      expect(onDropped).not.toHaveBeenCalled()

      // Buffer full - should drop oldest
      hook(createTestContext(4))
      expect(onDropped).toHaveBeenCalledTimes(1)
      expect((onDropped.mock.calls[0]![0] as DrainContext[])).toHaveLength(1)
      expect((onDropped.mock.calls[0]![0] as DrainContext[])[0]!.event.id).toBe(1)

      expect(hook.pending).toBe(3)

      // Flush and verify the remaining events are 2, 3, 4
      await hook.flush()
      const batch = drain.mock.calls[0]![0] as DrainContext[]
      expect(batch.map(c => c.event.id)).toEqual([2, 3, 4])
    })
  })

  describe('flush()', () => {
    it('drains all buffered events', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline({ batch: { size: 100 } })(drain)

      hook(createTestContext(1))
      hook(createTestContext(2))
      hook(createTestContext(3))

      await hook.flush()

      expect(drain).toHaveBeenCalledTimes(1)
      expect((drain.mock.calls[0]![0] as DrainContext[])).toHaveLength(3)
      expect(hook.pending).toBe(0)
    })

    it('is safe to call when buffer is empty', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline()(drain)

      await hook.flush()

      expect(drain).not.toHaveBeenCalled()
    })

    it('handles concurrent flush() calls safely', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline({ batch: { size: 100, intervalMs: 60000 } })(drain)

      hook(createTestContext(1))
      hook(createTestContext(2))

      const [r1, r2] = await Promise.all([hook.flush(), hook.flush()])

      expect(r1).toBeUndefined()
      expect(r2).toBeUndefined()
      expect(drain).toHaveBeenCalledTimes(1)
      expect(hook.pending).toBe(0)
    })

    it('flush drains events that arrived during active flush', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline({ batch: { size: 2, intervalMs: 60000 } })(drain)

      // Push 2 events to trigger auto-flush
      hook(createTestContext(1))
      hook(createTestContext(2))

      // Push more while flush may be in progress
      hook(createTestContext(3))

      // Explicit flush should drain everything
      await hook.flush()

      expect(hook.pending).toBe(0)
      const allEvents = drain.mock.calls.flatMap(call => call[0] as DrainContext[])
      expect(allEvents).toHaveLength(3)
    })
  })

  describe('pending', () => {
    it('returns current buffer size', () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline({ batch: { size: 100, intervalMs: 60000 } })(drain)

      expect(hook.pending).toBe(0)
      hook(createTestContext(1))
      expect(hook.pending).toBe(1)
      hook(createTestContext(2))
      expect(hook.pending).toBe(2)
    })

    it('returns 0 after flush', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline({ batch: { size: 100 } })(drain)

      hook(createTestContext(1))
      hook(createTestContext(2))
      expect(hook.pending).toBe(2)

      await hook.flush()
      expect(hook.pending).toBe(0)
    })
  })

  describe('defaults', () => {
    it('uses default options when none provided', async () => {
      const drain = vi.fn().mockResolvedValue(undefined)
      const hook = createDrainPipeline()(drain)

      hook(createTestContext(1))

      // Default interval is 5000ms
      await vi.advanceTimersByTimeAsync(4999)
      expect(drain).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(drain).toHaveBeenCalledTimes(1)
    })
  })

  describe('input validation', () => {
    it('throws on batch.size <= 0', () => {
      expect(() => createDrainPipeline({ batch: { size: 0 } })).toThrow('batch.size must be a positive finite number')
    })

    it('throws on batch.size = -1', () => {
      expect(() => createDrainPipeline({ batch: { size: -1 } })).toThrow('batch.size must be a positive finite number')
    })

    it('throws on batch.intervalMs <= 0', () => {
      expect(() => createDrainPipeline({ batch: { intervalMs: 0 } })).toThrow('batch.intervalMs must be a positive finite number')
    })

    it('throws on maxBufferSize <= 0', () => {
      expect(() => createDrainPipeline({ maxBufferSize: 0 })).toThrow('maxBufferSize must be a positive finite number')
    })

    it('throws on retry.maxAttempts <= 0', () => {
      expect(() => createDrainPipeline({ retry: { maxAttempts: 0 } })).toThrow('retry.maxAttempts must be a positive finite number')
    })

    it('throws on non-finite batch.size', () => {
      expect(() => createDrainPipeline({ batch: { size: Infinity } })).toThrow('batch.size must be a positive finite number')
    })

    it('throws on NaN batch.size', () => {
      expect(() => createDrainPipeline({ batch: { size: NaN } })).toThrow('batch.size must be a positive finite number')
    })
  })
})
