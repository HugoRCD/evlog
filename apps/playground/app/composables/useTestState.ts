interface TestState {
  status: 'idle' | 'loading' | 'success' | 'error'
  result?: any
  error?: any
  timestamp?: number
}

const state = ref<Record<string, TestState>>({})

export function useTestState() {
  return {
    /**
     * Get the current status of a test
     */
    getStatus: (id: string) => state.value[id]?.status ?? 'idle',

    /**
     * Get the result of a test
     */
    getResult: (id: string) => state.value[id]?.result,

    /**
     * Get the error of a test
     */
    getError: (id: string) => state.value[id]?.error,

    /**
     * Set the status of a test
     */
    setStatus: (id: string, status: TestState['status']) => {
      if (!state.value[id]) {
        state.value[id] = { status, timestamp: Date.now() }
      } else {
        state.value[id].status = status
        state.value[id].timestamp = Date.now()
      }
    },

    /**
     * Set the result of a test
     */
    setResult: (id: string, result: any) => {
      if (!state.value[id]) {
        state.value[id] = { status: 'success', result, timestamp: Date.now() }
      } else {
        state.value[id].result = result
      }
    },

    /**
     * Set the error of a test
     */
    setError: (id: string, error: any) => {
      if (!state.value[id]) {
        state.value[id] = { status: 'error', error, timestamp: Date.now() }
      } else {
        state.value[id].error = error
      }
    },

    /**
     * Clear results for a test (keep status)
     */
    clearResults: (id: string) => {
      if (state.value[id]) {
        state.value[id].result = undefined
        state.value[id].error = undefined
      }
    },

    /**
     * Clear a test entirely
     */
    clearTest: (id: string) => {
      delete state.value[id]
    },

    /**
     * Reset all tests
     */
    resetAll: () => {
      state.value = {}
    },

    /**
     * Get all test states (for debugging/history)
     */
    getAllStates: () => computed(() => state.value),
  }
}
