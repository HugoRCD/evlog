export interface UseLiveRefreshOptions {
  /** Polling cadence in ms. Default: 5000. */
  intervalMs?: number
  /**
   * Extra suspension signal — when `true` the poll is skipped (e.g. while the
   * run-detail slideover is open, so a manually sorted page doesn't shift
   * under the reader).
   */
  suspended?: Ref<boolean>
}

export interface UseLiveRefreshReturn {
  /** User-facing toggle — `false` after pressing pause. */
  enabled: Ref<boolean>
  /** Whether a poll actually fires right now (enabled + tab visible + not suspended). */
  active: ComputedRef<boolean>
  /**
   * The most recent tick's failure, if any — `null` once a later tick
   * succeeds. `refresh` itself decides what counts as a failure: Nuxt's
   * `useFetch`/`useAsyncData` `refresh()` resolves even on a failed request
   * (the error lands in its `.error` ref instead), so callers polling those
   * need to re-throw from inside `refresh` for it to surface here.
   */
  lastError: Ref<unknown>
  /** Flip the user toggle (pause/resume button). */
  toggle: () => void
}

/**
 * Polls `refresh` on a fixed cadence to keep the dashboard alive.
 *
 * Quiet by design: skips ticks while the tab is hidden (no wasted queries,
 * no burst on return), while the previous refresh is still in flight, and
 * while `suspended` is set. Client-only — the interval starts on mount.
 */
export function useLiveRefresh(refresh: () => Promise<unknown> | unknown, options: UseLiveRefreshOptions = {}): UseLiveRefreshReturn {
  const intervalMs = options.intervalMs ?? 5000
  const enabled = ref(true)
  const visible = ref(true)
  const inFlight = ref(false)
  const lastError = ref<unknown>(null)

  const active = computed(() => enabled.value && visible.value && !(options.suspended?.value ?? false))

  function toggle() {
    enabled.value = !enabled.value
  }

  async function tick() {
    if (!active.value || inFlight.value) return
    inFlight.value = true
    try {
      await refresh()
      lastError.value = null
    } catch (error) {
      lastError.value = error
    } finally {
      inFlight.value = false
    }
  }

  function onVisibilityChange() {
    visible.value = document.visibilityState === 'visible'
  }

  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    visible.value = document.visibilityState === 'visible'
    document.addEventListener('visibilitychange', onVisibilityChange)
    timer = setInterval(tick, intervalMs)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (timer) clearInterval(timer)
  })

  return { enabled, active, lastError, toggle }
}
