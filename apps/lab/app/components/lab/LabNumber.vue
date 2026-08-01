<script setup lang="ts">
/**
 * A slider and a numeric field in one row.
 *
 * The whole row is the track: press anywhere and the value goes there, keep
 * dragging and it follows. That directness is what a pure scrub control lacks —
 * with relative dragging alone, reaching the far end of a range means a long
 * sweep, and there is no way to simply *put* a value somewhere.
 *
 * Absolute positioning is coarse for a range like exposure though, so holding
 * shift switches to relative fine movement without letting go of the pointer.
 * Double-click types an exact value; right-click restores the default.
 */

const props = defineProps<{
  label: string
  min: number
  max: number
  step: number
  unit?: string
  /** Reset target, shown as a tick on the track. */
  default?: number
  /** One line explaining the control, shown on hover. */
  hint?: string
}>()

const model = defineModel<number>({ required: true })

const editing = ref(false)
const draft = ref('')
const dragging = ref(false)
const input = useTemplateRef('input')
const track = useTemplateRef('track')

/** Decimals implied by the step, so the readout never shows float noise. */
const precision = computed(() => {
  const text = String(props.step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
})

const display = computed(() => model.value.toFixed(precision.value))

const fraction = computed(() => {
  const span = props.max - props.min
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, (model.value - props.min) / span))
})

const defaultFraction = computed(() => {
  if (props.default === undefined) return null
  const span = props.max - props.min
  if (span <= 0) return null
  const value = (props.default - props.min) / span
  // A tick at either extreme sits under the track's own border and reads as an
  // artifact rather than as a marker.
  return value > 0.02 && value < 0.98 ? value : null
})

function commit(value: number) {
  const stepped = Math.round(value / props.step) * props.step
  const clamped = Math.min(props.max, Math.max(props.min, stepped))
  // Re-round after clamping: min/max are not always on the step grid.
  model.value = Number(clamped.toFixed(precision.value))
}

function valueAtClientX(clientX: number): number {
  const rect = track.value?.getBoundingClientRect()
  if (!rect?.width) return model.value
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return props.min + ratio * (props.max - props.min)
}

/** Rebased whenever shift is pressed or released mid-drag. */
let fineAnchorX = 0
let fineAnchorValue = 0
let lastX = 0
/**
 * Fine mode, as state rather than as a fact read off each event.
 *
 * Holding shift changed what a drag did with nothing on screen to say so, which
 * left the ratio to be inferred from how the number moved. It also has to react
 * to shift being pressed while the pointer is still — so it cannot live only in
 * the pointer handler.
 */
const dragFine = ref(false)
const hovering = ref(false)
const shiftDown = useShiftKey()

/**
 * Shown as fine while dragging, and while merely hovering with shift held.
 *
 * The second half is the point: a modifier that only reveals itself once you
 * have committed to a drag is a mode you discover by having already used it.
 */
const fine = computed(() => (dragging.value ? dragFine.value : hovering.value && shiftDown.value))

/** The value before the current click, so a double-click can put it back. */
let valueBeforeClick = 0
let lastDownAt = -Infinity
let lastDownX = 0

/** Type an exact value, on the number the field had before the pair of clicks. */
function onDoubleClick() {
  dragging.value = false
  dragFine.value = false
  model.value = valueBeforeClick
  void startEditing()
}

function setFine(next: boolean, atX: number) {
  if (next === dragFine.value) return
  dragFine.value = next
  // Rebase on the switch: the value must not jump when the ratio changes.
  fineAnchorX = atX
  fineAnchorValue = model.value
}

function applyPointer(event: PointerEvent) {
  lastX = event.clientX
  setFine(event.shiftKey, event.clientX)

  if (!dragFine.value) {
    commit(valueAtClientX(event.clientX))
    return
  }

  const width = track.value?.getBoundingClientRect().width || 1
  // A fifth of the travel per pixel, relative to where fine mode was entered.
  const delta = ((event.clientX - fineAnchorX) / width) * (props.max - props.min) * 0.2
  commit(fineAnchorValue + delta)
}

/** Shift can be pressed or let go without the pointer moving at all. */
function onModifier(event: KeyboardEvent) {
  if (dragging.value) setFine(event.shiftKey, lastX)
}

function onPointerDown(event: PointerEvent) {
  if (editing.value || event.button !== 0) return
  event.preventDefault()

  // `event.detail` cannot be used to spot the second click here: the
  // `preventDefault` above suppresses the compatibility mouse events, and the
  // click counter rides on those — it stays at one forever.
  const doubled = event.timeStamp - lastDownAt < 400 && Math.abs(event.clientX - lastDownX) < 5
  lastDownAt = event.timeStamp
  lastDownX = event.clientX

  // Keep the value from before the *first* click of a pair, so the double-click
  // can put it back. Without that, opening the field on a slider hands you the
  // number the first click knocked it to rather than the one you meant to edit.
  if (!doubled) valueBeforeClick = model.value
  dragging.value = true
  dragFine.value = event.shiftKey
  fineAnchorX = event.clientX
  fineAnchorValue = model.value
  window.addEventListener('keydown', onModifier)
  window.addEventListener('keyup', onModifier)
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  applyPointer(event)
}

function onPointerMove(event: PointerEvent) {
  if (dragging.value) applyPointer(event)
}

function onPointerUp(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  dragFine.value = false
  window.removeEventListener('keydown', onModifier)
  window.removeEventListener('keyup', onModifier)
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onModifier)
  window.removeEventListener('keyup', onModifier)
})

async function startEditing() {
  draft.value = display.value
  editing.value = true
  await nextTick()
  input.value?.select()
}

function applyDraft() {
  const parsed = Number(draft.value)
  if (Number.isFinite(parsed)) commit(parsed)
  editing.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    editing.value = false
    return
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    const direction = event.key === 'ArrowUp' ? 1 : -1
    commit(model.value + direction * props.step * (event.shiftKey ? 10 : 1))
    draft.value = display.value
  }
}

/** Restore the default without having to remember its value. */
function reset() {
  if (props.default !== undefined) commit(props.default)
}
</script>

<template>
  <div class="group py-0.5">
    <div
      v-if="editing"
      class="flex h-6.5 items-center gap-2 border border-accented bg-elevated/60 px-2"
    >
      <span class="shrink-0 font-mono text-[11px] leading-none text-dimmed">{{ label }}</span>
      <input
        ref="input"
        v-model="draft"
        type="text"
        inputmode="decimal"
        class="min-w-0 flex-1 bg-transparent text-right font-mono text-[11px] leading-none text-highlighted outline-none"
        @blur="applyDraft"
        @keydown.enter.prevent="applyDraft"
        @keydown="onKeydown"
      >
    </div>

    <div
      v-else
      ref="track"
      class="relative h-6.5 select-none overflow-hidden border bg-elevated/40 transition-colors"
      :class="[
        fine ? 'cursor-col-resize border-primary-500/70' : 'cursor-ew-resize',
        fine ? '' : dragging ? 'border-accented' : 'border-muted/80 hover:border-accented/60',
      ]"
      :title="hint ? `${label} — ${hint}\n\nDrag to set · shift for fine · double-click to type · right-click resets` : undefined"
      @pointerenter="hovering = true"
      @pointerleave="hovering = false"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="onDoubleClick"
      @contextmenu.prevent="reset"
    >
      <div
        class="pointer-events-none absolute inset-y-0 left-0 transition-colors"
        :class="fine ? 'bg-primary-500/25' : 'bg-accented/40'"
        :style="{ width: `${fraction * 100}%` }"
      />
      <!-- The exact position: a hairline reads precisely where a filled bar alone does not. -->
      <div
        class="pointer-events-none absolute inset-y-0 w-px"
        :class="fine ? 'bg-primary' : 'bg-accented'"
        :style="{ left: `${fraction * 100}%` }"
      />
      <!--
        The scale, revealed with the mode.
        Fine movement is worth a fifth of the travel per pixel, which is a claim
        about resolution — so the track shows the resolution it has gained. It
        fades in rather than appearing, because a row of hairlines snapping on
        under the pointer reads as a glitch.
      -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 flex h-1.5 justify-between px-px transition-opacity duration-200"
        :class="fine ? 'opacity-100' : 'opacity-0'"
      >
        <span
          v-for="index in 21"
          :key="index"
          class="w-px origin-bottom bg-primary-500/50 transition-transform duration-200"
          :class="[(index - 1) % 5 === 0 ? 'h-full' : 'h-1/2', fine ? 'scale-y-100' : 'scale-y-0']"
          :style="{ transitionDelay: `${Math.abs(index - 11) * 8}ms` }"
        />
      </div>

      <div
        v-if="defaultFraction !== null"
        class="pointer-events-none absolute bottom-0 h-0.75 w-px bg-accented"
        :style="{ left: `${defaultFraction * 100}%` }"
      />

      <div class="pointer-events-none relative flex h-full items-center justify-between gap-2 px-2">
        <!-- The label gives way to the mode: while fine is on, that is the more useful fact. -->
        <span
          v-if="fine"
          class="shrink-0 font-mono text-[10px] leading-none text-primary/85"
        >⇧ fine · ⅕</span>
        <span v-else class="truncate font-mono text-[11px] leading-none text-muted group-hover:text-toned">
          {{ label }}
        </span>
        <span
          class="shrink-0 font-mono text-[11px] leading-none tabular-nums"
          :class="fine ? 'text-primary' : 'text-default'"
        >
          {{ display }}<span v-if="unit" :class="fine ? 'text-primary/60' : 'text-dimmed'">{{ unit }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
