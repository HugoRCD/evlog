/**
 * Is shift down, right now, anywhere in the app?
 *
 * Modifiers change what a control will do before you touch it, so a control has
 * to be able to show that on hover rather than only once a drag has started. One
 * listener serves every instance: a panel holds dozens of numeric fields, and
 * thirty windows listeners for one boolean is a waste of a keystroke.
 *
 * Cleared on blur, and re-read from every pointer event, which is the half that
 * was missing. Tracking keydown and keyup alone means one missed keyup leaves
 * this stuck on for the rest of the session — and a browser or window-manager
 * shortcut that involves shift takes the keyup with it when it steals the
 * combination. Stuck on, merely moving the mouse across the panel lit every
 * slider it passed in the fine-mode blue, which reads as controls activating
 * themselves under the cursor.
 *
 * A pointer event carries the true modifier state, so any mouse movement puts
 * it right within one frame. That is a self-correcting signal rather than a
 * second thing to keep in sync.
 */

const down = ref(false)
let listeners = 0

function sync(event: KeyboardEvent | PointerEvent) {
  down.value = event.shiftKey
}

function clear() {
  down.value = false
}

export function useShiftKey() {
  onMounted(() => {
    if (listeners++ === 0) {
      window.addEventListener('keydown', sync)
      window.addEventListener('keyup', sync)
      window.addEventListener('pointermove', sync, { passive: true })
      window.addEventListener('pointerdown', sync, { passive: true })
      window.addEventListener('blur', clear)
      document.addEventListener('visibilitychange', clear)
    }
  })

  onBeforeUnmount(() => {
    if (--listeners === 0) {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
      window.removeEventListener('pointermove', sync)
      window.removeEventListener('pointerdown', sync)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', clear)
    }
  })

  return readonly(down)
}
