interface UseTestRunnerOptions {
  onSuccess?: (response: any) => void
  onError?: (error: any) => void
  endpoint?: string
  method?: 'GET' | 'POST'
}

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
        response = await $fetch(options.endpoint, {
          method: options.method || 'GET',
        })
      } else if (fn) {
        response = await fn()
      }

      state.setStatus(testId, 'success')
      state.setResult(testId, response)
      options?.onSuccess?.(response)

      return response
    } catch (err: any) {
      state.setStatus(testId, 'error')
      state.setError(testId, err)
      options?.onError?.(err)

      throw err
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
