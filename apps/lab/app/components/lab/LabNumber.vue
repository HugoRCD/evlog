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
let wasFine = false

function applyPointer(event: PointerEvent) {
  const fine = event.shiftKey
  if (fine !== wasFine) {
    wasFine = fine
    fineAnchorX = event.clientX
    fineAnchorValue = model.value
  }

  if (!fine) {
    commit(valueAtClientX(event.clientX))
    return
  }

  const width = track.value?.getBoundingClientRect().width || 1
  // A fifth of the travel per pixel, relative to where fine mode was entered.
  const delta = ((event.clientX - fineAnchorX) / width) * (props.max - props.min) * 0.2
  commit(fineAnchorValue + delta)
}

function onPointerDown(event: PointerEvent) {
  if (editing.value || event.button !== 0) return
  event.preventDefault()
  dragging.value = true
  wasFine = event.shiftKey
  fineAnchorX = event.clientX
  fineAnchorValue = model.value
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  applyPointer(event)
}

function onPointerMove(event: PointerEvent) {
  if (dragging.value) applyPointer(event)
}

function onPointerUp(event: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
}

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
      class="flex h-6.5 items-center gap-2 border border-zinc-600 bg-zinc-900/60 px-2"
    >
      <span class="shrink-0 font-mono text-[11px] leading-none text-zinc-500">{{ label }}</span>
      <input
        ref="input"
        v-model="draft"
        type="text"
        inputmode="decimal"
        class="min-w-0 flex-1 bg-transparent text-right font-mono text-[11px] leading-none text-zinc-100 outline-none"
        @blur="applyDraft"
        @keydown.enter.prevent="applyDraft"
        @keydown="onKeydown"
      >
    </div>

    <div
      v-else
      ref="track"
      class="relative h-6.5 cursor-ew-resize select-none overflow-hidden border bg-zinc-900/40 transition-colors"
      :class="dragging ? 'border-zinc-600' : 'border-zinc-800/80 hover:border-zinc-700'"
      :title="hint ? `${label} — ${hint}\n\nDrag to set · shift for fine · double-click to type · right-click resets` : undefined"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="startEditing"
      @contextmenu.prevent="reset"
    >
      <div
        class="pointer-events-none absolute inset-y-0 left-0 bg-zinc-700/40"
        :style="{ width: `${fraction * 100}%` }"
      />
      <!-- The exact position: a hairline reads precisely where a filled bar alone does not. -->
      <div
        class="pointer-events-none absolute inset-y-0 w-px bg-zinc-400/70"
        :style="{ left: `${fraction * 100}%` }"
      />
      <div
        v-if="defaultFraction !== null"
        class="pointer-events-none absolute bottom-0 h-0.75 w-px bg-zinc-600"
        :style="{ left: `${defaultFraction * 100}%` }"
      />

      <div class="pointer-events-none relative flex h-full items-center justify-between gap-2 px-2">
        <span class="truncate font-mono text-[11px] leading-none text-zinc-400 group-hover:text-zinc-300">
          {{ label }}
        </span>
        <span class="shrink-0 font-mono text-[11px] leading-none text-zinc-200 tabular-nums">
          {{ display }}<span v-if="unit" class="text-zinc-500">{{ unit }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
