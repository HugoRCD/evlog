/**
 * Is shift down, right now, anywhere in the app?
 *
 * Modifiers change what a control will do before you touch it, so a control has
 * to be able to show that on hover rather than only once a drag has started. One
 * listener serves every instance: a panel holds dozens of numeric fields, and
 * thirty windows listeners for one boolean is a waste of a keystroke.
 *
 * Also cleared on blur — stepping away with shift held and coming back to a
 * whole panel still claiming fine mode would be a lie the app never corrects.
 */

const down = ref(false)
let listeners = 0

function sync(event: KeyboardEvent) {
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
      window.addEventListener('blur', clear)
    }
  })

  onBeforeUnmount(() => {
    if (--listeners === 0) {
      window.removeEventListener('keydown', sync)
      window.removeEventListener('keyup', sync)
      window.removeEventListener('blur', clear)
    }
  })

  return readonly(down)
}
