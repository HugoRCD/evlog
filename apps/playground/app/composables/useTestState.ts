interface TestState {
  status: 'idle' | 'loading' | 'success' | 'error'
  result?: any
  error?: any
  timestamp?: number
}

const state = ref<Record<string, TestState>>({})

function patchTest(id: string, patch: Partial<TestState>): void {
  state.value = {
    ...state.value,
    [id]: {
      ...state.value[id],
      status: state.value[id]?.status ?? 'idle',
      ...patch,
      timestamp: Date.now(),
    },
  }
}

export function useTestState() {
  return {
    getStatus: (id: string) => state.value[id]?.status ?? 'idle',

    getResult: (id: string) => state.value[id]?.result,

    getError: (id: string) => state.value[id]?.error,

    setStatus: (id: string, status: TestState['status']) => {
      patchTest(id, { status })
    },

    setResult: (id: string, result: any) => {
      patchTest(id, { result, status: state.value[id]?.status ?? 'success' })
    },

    setError: (id: string, error: any) => {
      patchTest(id, { error, status: 'error' })
    },

    clearResults: (id: string) => {
      if (!state.value[id]) return
      patchTest(id, { result: undefined, error: undefined })
    },

    clearTest: (id: string) => {
      const next = { ...state.value }
      delete next[id]
      state.value = next
    },

    resetAll: () => {
      state.value = {}
    },
  }
}
