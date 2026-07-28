/**
 * Direct manipulation of the camera, on the frame itself.
 *
 * Composing a shot through seven numeric fields means guessing which of pitch,
 * yaw and roll moves the plate the way you meant, then correcting the framing
 * the rotation just broke. Dragging the thing you are looking at removes the
 * translation step entirely.
 *
 * The bindings follow the convention every 3D viewport uses, so it needs no
 * explanation to anyone who has used one: drag orbits, shift-drag pans,
 * alt-drag rolls, wheel zooms.
 */

import { RANGES } from '~/utils/lab/settings'
import type { LabSettings } from '~/utils/lab/settings'

type Mode = 'orbit' | 'pan' | 'roll'

/** Degrees of rotation per pixel dragged. */
const ORBIT_SENSITIVITY = 0.25
const ROLL_SENSITIVITY = 0.3
/** Multiplier per wheel notch, applied exponentially so zoom feels linear. */
const ZOOM_SENSITIVITY = 0.0015

function clamp(key: keyof typeof RANGES, value: number) {
  const range = RANGES[key]
  return Math.min(range.max, Math.max(range.min, value))
}

export interface CameraGestures {
  /** True while a drag is in progress — used to swap the cursor. */
  readonly active: Readonly<Ref<boolean>>
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onWheel: (event: WheelEvent) => void
}

export function useCameraGestures(
  settings: Ref<LabSettings>,
  /** Returns false to ignore gestures — while the focus picker is armed, say. */
  enabled: () => boolean,
  /** Current camera distance, which sets how much world a pixel of pan covers. */
  cameraDistance: () => number,
): CameraGestures {
  const active = ref(false)
  let mode: Mode = 'orbit'
  let lastX = 0
  let lastY = 0

  function modeFor(event: PointerEvent | MouseEvent): Mode {
    if (event.shiftKey) return 'pan'
    if (event.altKey || event.metaKey) return 'roll'
    // Middle-drag pans too: it is what a three-button mouse expects.
    if ('button' in event && event.button === 1) return 'pan'
    return 'orbit'
  }

  function onPointerDown(event: PointerEvent) {
    if (!enabled() || (event.button !== 0 && event.button !== 1)) return
    event.preventDefault()
    mode = modeFor(event)
    lastX = event.clientX
    lastY = event.clientY
    active.value = true
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent) {
    if (!active.value) return
    const dx = event.clientX - lastX
    const dy = event.clientY - lastY
    lastX = event.clientX
    lastY = event.clientY

    // Re-read the modifiers each frame so the mode can change mid-drag without
    // letting go, which is how these gestures are normally used.
    mode = modeFor(event)
    const next = { ...settings.value }

    if (mode === 'orbit') {
      next.yaw = clamp('yaw', next.yaw + dx * ORBIT_SENSITIVITY)
      // Dragging down should tip the top of the plate away, so the plate
      // follows the pointer rather than opposing it.
      next.pitch = clamp('pitch', next.pitch - dy * ORBIT_SENSITIVITY)
    } else if (mode === 'roll') {
      next.roll = clamp('roll', next.roll + dx * ROLL_SENSITIVITY)
    } else {
      // Pan in world units, derived from how much of the world one pixel covers
      // at the plate's distance — so the plate tracks the pointer exactly
      // instead of drifting at a rate that depends on zoom and field of view.
      const element = event.currentTarget as HTMLElement
      const height = element.clientHeight || 1
      const tanHalfFov = Math.tan((next.fov * Math.PI) / 360)
      // Visible world height at the plate's distance, divided by the frame's
      // height in pixels. Dropping the distance term makes pan crawl, since the
      // camera sits several units back.
      const worldPerPixel = (2 * cameraDistance() * tanHalfFov) / height
      next.panX = clamp('panX', next.panX + dx * worldPerPixel)
      next.panY = clamp('panY', next.panY - dy * worldPerPixel)
    }

    settings.value = next
  }

  function onPointerUp(event: PointerEvent) {
    if (!active.value) return
    active.value = false
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
  }

  function onWheel(event: WheelEvent) {
    if (!enabled()) return
    event.preventDefault()
    // Exponential, so a notch changes the framing by the same proportion
    // whether you are wide or tight.
    const factor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY)
    settings.value = { ...settings.value, zoom: clamp('zoom', settings.value.zoom * factor) }
  }

  return { active: readonly(active), onPointerDown, onPointerMove, onPointerUp, onWheel }
}
