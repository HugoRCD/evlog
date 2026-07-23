/** Shared client-side cache for whether the password gate is active. */
export function useAuthRequired() {
  return useState<boolean | null>('evlog-auth-required', () => null)
}

/** Loads `/api/auth/config` once per app load and caches the result. */
export async function loadAuthRequired(): Promise<boolean> {
  const state = useAuthRequired()
  if (state.value === null) {
    const { authRequired } = await $fetch<{ authRequired: boolean }>('/api/auth/config')
    state.value = authRequired
  }
  return state.value
}
