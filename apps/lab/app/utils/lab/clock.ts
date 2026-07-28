/**
 * A virtual clock for deterministic capture.
 *
 * Every animation in the docs is driven by `requestAnimationFrame(timestamp)` —
 * `useTimedSequence` integrates the delta between timestamps, and motion-v runs
 * its own rAF frameloop off `performance.now()`. Swap both for a clock we step
 * by hand and the whole page becomes a function of time.
 *
 * That is the difference between screen-recording a preview and rendering a
 * video: frames come out at exactly 1/fps apart no matter how long each one
 * actually took to produce, so a 60fps export stays smooth even when a single
 * frame needs 200ms of serialization and blur.
 *
 * Known limit: timers are not virtualized. Patching `setTimeout` globally is a
 * good way to deadlock an export on some unrelated library awaiting one, and
 * nothing in the docs animates off a timer.
 */

type ClockMode = 'live' | 'virtual'

export interface Clock {
  /** Virtual milliseconds elapsed since the clock was created or reset. */
  readonly now: number
  enterVirtual: () => void
  /**
   * Push time forward by `deltaMs`, run every frame callback waiting on it, and
   * wait for the DOM to settle. Deterministic — this is the export path.
   */
  advance: (deltaMs: number) => Promise<void>
  /**
   * Same, without waiting for the DOM to settle.
   *
   * The preview runs one of these per displayed frame and cannot afford two
   * macrotask round-trips inside its own loop. Vue applies the resulting state
   * change a microtask later, so the plate is at most one frame behind — which
   * nobody can see, and which the export path does not tolerate.
   */
  advanceSync: (deltaMs: number) => void
  /** Schedule on the real display loop, bypassing the patch. */
  raf: (callback: FrameRequestCallback) => number
  cancelRaf: (handle: number) => void
  /** Rewind to zero. Callers are expected to remount the scene alongside this. */
  reset: () => void
  dispose: () => void
}

interface Natives {
  requestAnimationFrame: typeof window.requestAnimationFrame
  cancelAnimationFrame: typeof window.cancelAnimationFrame
  performanceNow: () => number
  setTimeout: typeof window.setTimeout
}

/**
 * Let queued microtasks (Vue's render flush) settle before the next frame.
 *
 * A message port rather than a timer: browsers clamp `setTimeout` to roughly a
 * second in a background tab, and an export waits on this twice per frame. On a
 * timer, looking away mid-render would take a thirty second take to well over
 * an hour. Message channel tasks are not throttled.
 */
function createSettle(): () => Promise<void> {
  const channel = new MessageChannel()
  let pending: (() => void) | null = null

  channel.port1.onmessage = () => {
    const resolve = pending
    pending = null
    resolve?.()
  }

  return () => new Promise<void>((resolve) => {
    // Only one settle is ever in flight, so a single slot is enough.
    pending = resolve
    channel.port2.postMessage(null)
  })
}

export function createClock(): Clock {
  const natives: Natives = {
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    performanceNow: performance.now.bind(performance),
    setTimeout: window.setTimeout.bind(window),
  }

  const settle = createSettle()

  let mode: ClockMode = 'live'
  let virtualTime = 0
  let nextHandle = 1
  let queue = new Map<number, FrameRequestCallback>()
  /** Animations paused on entering virtual mode, so they can be resumed on exit. */
  const captured = new Set<Animation>()

  function patch() {
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const handle = nextHandle++
      queue.set(handle, callback)
      return handle
    }
    window.cancelAnimationFrame = (handle: number) => {
      queue.delete(handle)
    }
    performance.now = () => virtualTime
  }

  function restore() {
    window.requestAnimationFrame = natives.requestAnimationFrame
    window.cancelAnimationFrame = natives.cancelAnimationFrame
    performance.now = natives.performanceNow
  }

  /**
   * Drive Web Animations by hand.
   *
   * CSS animations and transitions run on the compositor against the real
   * document timeline — `performance.now()` never touches them. They have to be
   * paused and seeked individually, and re-scanned every frame because Vue
   * transitions create new ones mid-capture.
   */
  function syncAnimations() {
    for (const animation of document.getAnimations()) {
      if (!captured.has(animation)) {
        captured.add(animation)
        try {
          animation.pause()
          // Rebase to the virtual clock: an animation born at virtual time T
          // should be at its own zero right now.
          animation.currentTime = 0
        } catch {
          // Animations can finish and detach between the scan and the seek.
        }
      }
      try {
        const start = (animation as Animation & { __labStart?: number }).__labStart
        if (start === undefined) {
          Object.assign(animation, { __labStart: virtualTime })
          animation.currentTime = 0
        } else {
          animation.currentTime = virtualTime - start
        }
      } catch {
        // Same — a detached animation throws on assignment.
      }
    }
  }

  /** Advance the clock and run the frame callbacks queued against it. */
  function runBatch(deltaMs: number) {
    virtualTime += deltaMs

    // Swap the queue before running: callbacks that schedule the next frame
    // must land in the following batch, not re-run inside this one.
    const batch = Array.from(queue.values())
    queue = new Map()
    for (const callback of batch) {
      try {
        callback(virtualTime)
      } catch (error) {
        console.error('[lab] frame callback threw', error)
      }
    }
  }

  function releaseAnimations() {
    for (const animation of captured) {
      try {
        animation.play()
      } catch {
        // Already finished or cancelled.
      }
    }
    captured.clear()
  }

  return {
    get now() {
      return virtualTime
    },

    enterVirtual() {
      if (mode === 'virtual') return
      mode = 'virtual'
      queue = new Map()
      patch()
      syncAnimations()
    },

    advanceSync(deltaMs: number) {
      if (mode !== 'virtual') return
      runBatch(deltaMs)
      syncAnimations()
    },

    async advance(deltaMs: number) {
      if (mode !== 'virtual') return
      runBatch(deltaMs)

      await settle()
      syncAnimations()
      // A second settle: the first lets Vue apply state changes, this one lets
      // any transition those changes started register itself.
      await settle()
    },

    raf: callback => natives.requestAnimationFrame(callback),
    cancelRaf: handle => natives.cancelAnimationFrame(handle),

    reset() {
      virtualTime = 0
      queue = new Map()
      releaseAnimations()
    },

    dispose() {
      if (mode === 'virtual') restore()
      releaseAnimations()
      queue = new Map()
    },
  }
}
