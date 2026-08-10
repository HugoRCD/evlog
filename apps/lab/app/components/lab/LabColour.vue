<script setup lang="ts">
/**
 * A colour, picked in the panel rather than in the operating system.
 *
 * `<input type="color">` opens the platform's own dialog, which is a different
 * application appearing over this one — it does not take the panel's theme, it
 * cannot be reached from the keyboard the way the rest of these controls can,
 * and on every platform it looks like somewhere else.
 *
 * It also cannot express the one thing type most needs: an alpha. A caption at
 * sixty per cent over a bright plate is the ordinary case, and the only way to
 * reach it was to fade the whole layer — which takes the outline and the glow
 * down with it.
 *
 * So the value is an eight-digit hex when it carries an alpha and six when it
 * does not. Canvas takes both in `fillStyle`, which is what makes the alpha
 * free at the point it is drawn.
 */
const props = withDefaults(defineProps<{
  label: string
  /** `#rrggbb` or `#rrggbbaa`. */
  modelValue: string
  /** Off where the value feeds something that cannot be transparent. */
  alpha?: boolean
}>(), { alpha: true })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const root = useTemplateRef('root')

/**
 * Close on anything that is not this control.
 *
 * A plain document listener rather than a helper from a library the lab does
 * not otherwise use — one popover does not earn a dependency. Captured on the
 * way down so it still fires when the press lands on something that stops
 * propagation, which the frame's own pointer handling does.
 */
function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value) return
  const { target } = event
  if (target instanceof Node && root.value?.contains(target)) return
  open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true))

interface Hsv { h: number, s: number, v: number, a: number }

function parse(hex: string): Hsv {
  const match = /^#?([\da-f]{6})([\da-f]{2})?$/i.exec(hex.trim())
  if (!match?.[1]) return { h: 0, s: 0, v: 1, a: 1 }
  const int = Number.parseInt(match[1], 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  const a = match[2] ? Number.parseInt(match[2], 16) / 255 : 1

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const span = max - min

  let h = 0
  if (span > 0) {
    if (max === r) h = ((g - b) / span + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / span + 2) * 60
    else h = ((r - g) / span + 4) * 60
  }
  return { h, s: max === 0 ? 0 : span / max, v: max, a }
}

function toHex({ h, s, v, a }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  const pair = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0')
  const rgb = `#${pair(f(5))}${pair(f(3))}${pair(f(1))}`
  // Six digits when opaque, so a value that never needed an alpha never grows
  // one — and everything downstream that parses six keeps working.
  return props.alpha && a < 1 ? `${rgb}${pair(a)}` : rgb
}

const hsv = computed(() => parse(props.modelValue))

function patch(next: Partial<Hsv>) {
  emit('update:modelValue', toHex({ ...hsv.value, ...next }))
}

/**
 * Track a pointer across a box until it is released.
 *
 * Capture on the element rather than listeners on the window: a drag that
 * leaves the square has to keep steering it, and releasing outside has to end
 * it — which is exactly what pointer capture is for.
 */
function drag(event: PointerEvent, onMove: (x: number, y: number) => void) {
  const element = event.currentTarget as HTMLElement
  element.setPointerCapture(event.pointerId)
  const apply = (e: PointerEvent) => {
    const box = element.getBoundingClientRect()
    onMove(
      Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    )
  }
  apply(event)
  const move = (e: PointerEvent) => apply(e)
  const stop = () => {
    element.removeEventListener('pointermove', move)
    element.removeEventListener('pointerup', stop)
    element.removeEventListener('pointercancel', stop)
  }
  element.addEventListener('pointermove', move)
  element.addEventListener('pointerup', stop)
  element.addEventListener('pointercancel', stop)
}

/** The pure hue at the current position, for the square's own background. */
const hueColour = computed(() => toHex({ h: hsv.value.h, s: 1, v: 1, a: 1 }))

/** A checkerboard, so a transparent swatch reads as transparent rather than as white. */
const CHECKER = 'repeating-conic-gradient(#666 0% 25%, #999 0% 50%) 0 / 8px 8px'
</script>

<template>
  <div ref="root" class="relative">
    <div class="flex items-center justify-between gap-3">
      <span class="font-mono text-[11px] text-dimmed">{{ label }}</span>
      <button
        type="button"
        data-cuelume-press
        class="flex items-center gap-1.5 border border-muted px-1.5 py-1 transition-colors hover:border-accented"
        :aria-label="`${label} — pick a colour`"
        @click="open = !open"
      >
        <span class="block size-3 border border-white/20" :style="{ background: CHECKER }">
          <span class="block size-full" :style="{ backgroundColor: modelValue }" />
        </span>
        <span class="font-mono text-[10px] uppercase text-dimmed">{{ modelValue }}</span>
      </button>
    </div>

    <!--
      Anchored to the right edge of the panel and opening downward. The panel is
      dragged as narrow as 240px, and a popover centred on its trigger would
      hang off the side of the window at that width.
    -->
    <div
      v-if="open"
      class="absolute right-0 top-full z-40 mt-1 w-52 border border-default bg-default p-2 shadow-[var(--lab-shadow-overlay)]"
    >
      <div
        class="relative h-24 w-full cursor-crosshair"
        :style="{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColour})` }"
        @pointerdown="drag($event, (x, y) => patch({ s: x, v: 1 - y }))"
      >
        <span
          class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          :style="{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }"
        />
      </div>

      <div
        class="relative mt-2 h-2.5 w-full cursor-ew-resize"
        style="background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
        @pointerdown="drag($event, x => patch({ h: x * 360 }))"
      >
        <span
          class="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          :style="{ left: `${(hsv.h / 360) * 100}%` }"
        />
      </div>

      <div
        v-if="alpha"
        class="relative mt-2 h-2.5 w-full cursor-ew-resize"
        :style="{ background: CHECKER }"
        @pointerdown="drag($event, x => patch({ a: x }))"
      >
        <span
          class="absolute inset-0"
          :style="{ background: `linear-gradient(to right, transparent, ${hueColour})` }"
        />
        <span
          class="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          :style="{ left: `${hsv.a * 100}%` }"
        />
      </div>

      <!--
        The hex stays editable. Picking is for finding a colour; typing is for
        the one you already have, and a picker without a field makes you hunt
        for a value you could have pasted.
      -->
      <input
        :value="modelValue"
        spellcheck="false"
        class="mt-2 w-full border border-muted bg-elevated/40 px-1.5 py-1 font-mono text-[10px] uppercase text-default outline-none focus:border-accented"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).value.trim())"
      >
    </div>
  </div>
</template>
