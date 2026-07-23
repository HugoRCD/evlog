/**
 * Tracks which row ids just arrived on a live poll so they can flash
 * (`.live-flash-fresh`) and fade. The first render is never marked fresh —
 * the page loading isn't "new data". Shared by `LiveFeed` and `RunsTable`.
 */
export function useFreshIds(rows: Ref<{ id: number }[]> | ComputedRef<{ id: number }[]>, options: { flashMs?: number } = {}) {
  const flashMs = options.flashMs ?? 900
  const seenIds = ref<Set<number>>(new Set())
  const freshIds = ref<Set<number>>(new Set())
  let initialized = false

  watch(rows, (next) => {
    if (!initialized) {
      initialized = true
      seenIds.value = new Set(next.map(r => r.id))
      return
    }
    const fresh = next.filter(r => !seenIds.value.has(r.id)).map(r => r.id)
    if (fresh.length === 0) return
    for (const id of fresh) seenIds.value.add(id)
    freshIds.value = new Set([...freshIds.value, ...fresh])
    setTimeout(() => {
      freshIds.value = new Set([...freshIds.value].filter(id => !fresh.includes(id)))
    }, flashMs)
  }, { immediate: true })

  function isFresh(id: number): boolean {
    return freshIds.value.has(id)
  }

  return { isFresh }
}
