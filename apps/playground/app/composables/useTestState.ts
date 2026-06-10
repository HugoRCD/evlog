interface TestState {
  status: 'idle' | 'loading' | 'success' | 'error'
  result?: any
  error?: any
  timestamp?: number
}

const state = ref<Record<string, TestState>>({})

export function useTestState() {
  return {
    getStatus: (id: string) => state.value[id]?.status ?? 'idle',

    getResult: (id: string) => state.value[id]?.result,

    getError: (id: string) => state.value[id]?.error,

    setStatus: (id: string, status: TestState['status']) => {
      if (!state.value[id]) {
        state.value[id] = { status, timestamp: Date.now() }
      } else {
        state.value[id].status = status
        state.value[id].timestamp = Date.now()
      }
    },

    setResult: (id: string, result: any) => {
      if (!state.value[id]) {
        state.value[id] = { status: 'success', result, timestamp: Date.now() }
      } else {
        state.value[id].result = result
      }
    },

    setError: (id: string, error: any) => {
      if (!state.value[id]) {
        state.value[id] = { status: 'error', error, timestamp: Date.now() }
      } else {
        state.value[id].error = error
      }
    },

    clearResults: (id: string) => {
      if (state.value[id]) {
        state.value[id].result = undefined
        state.value[id].error = undefined
      }
    },

    clearTest: (id: string) => {
      delete state.value[id]
    },

    resetAll: () => {
      state.value = {}
    },
  }
}
