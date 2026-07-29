/**
 * A draggable edge for a panel.
 *
 * Any tool people spend time in lets them decide how much room each area gets —
 * a wide grade panel while colouring, a tall timeline while cutting. Fixed
 * widths are a decision taken on the user's behalf, every session.
 *
 * The size is persisted on its own key rather than in the document: it is how
 * somebody likes to work, not part of the shot, and it should not travel in a
 * share link.
 */

export interface Resizable {
  size: Readonly<Ref<number>>
  dragging: Readonly<Ref<boolean>>
  onPointerDown: (event: PointerEvent) => void
}

export interface ResizableOptions {
  key: string
  initial: number
  min: number
  max: number
  /** Which way the size grows relative to pointer movement. */
  axis: 'x' | 'y'
}

export function useResizable(options: ResizableOptions): Resizable {
  const size = ref(options.initial)
  const dragging = ref(false)

  const storageKey = `render-labs:${options.key}`

  onMounted(() => {
    const stored = Number(localStorage.getItem(storageKey))
    if (Number.isFinite(stored) && stored > 0) {
      size.value = Math.min(options.max, Math.max(options.min, stored))
    }
  })

  let startPointer = 0
  let startSize = 0

  function onPointerMove(event: PointerEvent) {
    if (!dragging.value) return
    // Both panels sit against an edge, so dragging towards the centre of the
    // window makes them larger — hence the inverted delta.
    const delta = options.axis === 'x'
      ? startPointer - event.clientX
      : startPointer - event.clientY
    size.value = Math.min(options.max, Math.max(options.min, startSize + delta))
  }

  function onPointerUp() {
    if (!dragging.value) return
    dragging.value = false
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    try {
      localStorage.setItem(storageKey, String(Math.round(size.value)))
    } catch {
      // A layout preference is not worth surfacing an error for.
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    dragging.value = true
    startPointer = options.axis === 'x' ? event.clientX : event.clientY
    startSize = size.value
    // Listened on the window, so a fast drag that outruns the 4px handle keeps
    // resizing instead of stopping dead.
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  })

  return { size: readonly(size), dragging: readonly(dragging), onPointerDown }
}
