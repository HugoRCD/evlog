interface UseTestRunnerOptions {
  onSuccess?: (response: any) => void
  onError?: (error: any) => void
  endpoint?: string
  method?: 'GET' | 'POST'
  /** Abort $fetch after this many ms (playground cards). */
  timeoutMs?: number
}

const DEFAULT_FETCH_TIMEOUT_MS = 15_000

export function useTestRunner(testId: string, options?: UseTestRunnerOptions) {
  const state = useTestState()

  const isLoading = computed(() => state.getStatus(testId) === 'loading')
  const result = computed(() => state.getResult(testId))
  const error = computed(() => state.getError(testId))
  const status = computed(() => state.getStatus(testId))

  async function execute(fn?: () => Promise<any> | void) {
    state.setStatus(testId, 'loading')
    state.clearResults(testId)

    try {
      let response

      if (options?.endpoint) {
        const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

        try {
          response = await $fetch(options.endpoint, {
            method: options.method || 'GET',
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeoutId)
        }
      } else if (fn) {
        response = await fn()
      }

      state.setStatus(testId, 'success')
      state.setResult(testId, response)
      options?.onSuccess?.(response)

      return response
    } catch (err: unknown) {
      state.setStatus(testId, 'error')
      state.setError(testId, summarizeError(err))
      options?.onError?.(err)
      throw err
    } finally {
      if (state.getStatus(testId) === 'loading') {
        state.setStatus(testId, 'idle')
      }
    }
  }

  function reset() {
    state.clearTest(testId)
  }

  return {
    execute,
    isLoading,
    result,
    error,
    status,
    reset,
  }
}

function summarizeError(err: unknown): { message: string } {
  if (err && typeof err === 'object' && 'message' in err) {
    return { message: String((err as { message: unknown }).message) }
  }
  return { message: String(err) }
}
