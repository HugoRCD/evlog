<script setup lang="ts">
/**
 * The take, laid out in time.
 *
 * Scrubbing turns a looping animation into something that can be inspected: a
 * frame can be held still and graded, and the interesting two seconds of a six
 * second sequence can be picked out instead of exporting all of it and trimming
 * it afterwards in another tool.
 *
 * The ruler is in component time — the clock the staged animation runs on — not
 * output time. Those differ whenever playback speed is not 1, and a segment has
 * to be chosen against what the component is doing, not against how long the
 * file will end up being.
 *
 * Every grab target is drawn. An invisible hit zone that only announces itself
 * by changing the cursor makes a timeline feel broken: the pointer flickers
 * between shapes with nothing on screen to explain why.
 */

import { layerEnd } from '~/utils/lab/layers'
import type { Layer } from '~/utils/lab/layers'

const props = defineProps<{
  playhead: number
  length: number
  playing: boolean
  /** True while a seek is in flight, so the playhead can show it is catching up. */
  seeking: boolean
  outputMs: number
  frames: number
  selectedId: string | null
}>()

const emit = defineEmits<{
  scrub: [ms: number]
  togglePlay: []
  select: [id: string | null]
  addText: []
  addImage: []
  addComponent: []
  duplicate: [id: string]
  copy: [id: string]
  paste: []
  split: [id: string]
  remove: [id: string]
}>()

const layers = defineModel<Layer[]>('layers', { required: true })

const ruler = useTemplateRef('ruler')

/** Shortest gap between the two trim handles, so they can always be told apart. */
const MIN_SEGMENT = 100
/** Snap radius in ms, scaled below so it stays a constant distance on screen. */
const SNAP_PIXELS = 6

type Drag =
  | { kind: 'playhead' }
  | { kind: 'clip', id: string, grab: 'body' | 'start' | 'end', offset: number }

const drag = ref<Drag | null>(null)
const hoveredId = ref<string | null>(null)

/** Right-click menu, anchored where the click landed. */
const menu = ref<{ x: number, y: number, id: string } | null>(null)
const mediaMenu = ref(false)
const menuEl = useTemplateRef('menuEl')

/**
 * Keep the menu on screen.
 *
 * The timeline sits at the bottom of the window, so a menu opened downwards from
 * a clip runs straight off the edge — which is where this one was landing. It is
 * measured after mounting and flipped rather than sized by guesswork.
 */
async function openMenu(event: MouseEvent, layer: Layer) {
  emit('select', layer.id)
  menu.value = { x: event.clientX, y: event.clientY, id: layer.id }

  await nextTick()
  const box = menuEl.value?.getBoundingClientRect()
  if (!box || !menu.value) return

  const margin = 8
  let { x, y } = menu.value
  if (y + box.height > window.innerHeight - margin) y = Math.max(margin, y - box.height)
  if (x + box.width > window.innerWidth - margin) x = Math.max(margin, x - box.width)
  menu.value = { ...menu.value, x, y }
}

function closeMenu() {
  menu.value = null
  mediaMenu.value = false
}

/** True when the playhead falls inside the clip, which is what split needs. */
const canSplit = computed(() => {
  const layer = layers.value.find(entry => entry.id === menu.value?.id)
  if (!layer) return false
  return props.playhead > layer.start + MIN_SEGMENT && props.playhead < layerEnd(layer) - MIN_SEGMENT
})

function run(action: 'duplicate' | 'copy' | 'split' | 'remove') {
  const id = menu.value?.id
  closeMenu()
  if (!id) return
  emit(action, id)
}

onMounted(() => window.addEventListener('pointerdown', closeMenu))
onBeforeUnmount(() => window.removeEventListener('pointerdown', closeMenu))

/**
 * The ruler runs past the end of the take.
 *
 * The timeline is exactly as long as its content, so without headroom every
 * clip ends flush against the right edge and there is nowhere to drag it to
 * make it longer. The spare quarter is scrubbing and editing room, not part of
 * the export — the shaded band marks where the take actually stops.
 */
const HEADROOM = 1.25
/** Floor for that headroom, so a short take still has room to drag into. */
const MIN_HEADROOM = 3000

const span = computed(() => Math.max(1, props.length * HEADROOM, props.length + MIN_HEADROOM))

function percent(ms: number) {
  return Math.min(100, Math.max(0, (ms / span.value) * 100))
}

function trackWidth(): number {
  return ruler.value?.getBoundingClientRect().width || 1
}

function msAtClientX(clientX: number): number {
  const rect = ruler.value?.getBoundingClientRect()
  if (!rect?.width) return 0
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return ratio * span.value
}

/**
 * Pull a time towards the edges that matter.
 *
 * Without it, lining a title up with the in point is a pixel-hunting exercise
 * and the result is off by a frame nobody can see but the export can.
 */
function snap(ms: number, ignoreId?: string): number {
  const tolerance = (SNAP_PIXELS / trackWidth()) * span.value
  const candidates = [0, props.length, props.playhead]
  for (const layer of layers.value) {
    if (layer.id === ignoreId) continue
    candidates.push(layer.start, layerEnd(layer))
  }

  let best = ms
  let bestDistance = tolerance
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - ms)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

function startDrag(event: PointerEvent, next: Drag) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  drag.value = next
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  applyDrag(event)
}

function applyDrag(event: PointerEvent) {
  const current = drag.value
  if (!current) return
  const raw = msAtClientX(event.clientX)

  if (current.kind === 'playhead') {
    emit('scrub', Math.round(raw))
    return
  }

  const index = layers.value.findIndex(layer => layer.id === current.id)
  const layer = layers.value[index]
  if (!layer) return
  const updated = { ...layer }

  if (current.grab === 'body') {
    const start = snap(raw - current.offset, layer.id)
    updated.start = Math.max(0, Math.min(start, span.value - layer.duration))
  } else if (current.grab === 'start') {
    const start = Math.max(0, Math.min(snap(raw, layer.id), layerEnd(layer) - MIN_SEGMENT))
    updated.duration = layerEnd(layer) - start
    updated.start = start
  } else {
    const end = Math.min(span.value, Math.max(snap(raw, layer.id), layer.start + MIN_SEGMENT))
    updated.duration = end - layer.start
  }

  updated.start = Math.round(updated.start)
  updated.duration = Math.round(updated.duration)
  layers.value = layers.value.map((entry, at) => (at === index ? updated : entry))
}

function endDrag(event: PointerEvent) {
  if (!drag.value) return
  drag.value = null
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
}

function onClipDown(event: PointerEvent, layer: Layer, grab: 'body' | 'start' | 'end') {
  emit('select', layer.id)
  startDrag(event, { kind: 'clip', id: layer.id, grab, offset: msAtClientX(event.clientX) - layer.start })
}

/**
 * Ticks on a 0.5, 1, 2 or 5 second grid.
 *
 * Picking the step from the span keeps the ruler readable at any length rather
 * than crowding into a solid band on a long take.
 */
const ticks = computed(() => {
  const seconds = span.value / 1000
  const step = seconds <= 4 ? 0.5 : seconds <= 12 ? 1 : seconds <= 30 ? 2 : 5
  const marks: { at: number, label: string }[] = []
  for (let t = 0; t <= seconds + 1e-6; t += step) {
    marks.push({ at: (t / seconds) * 100, label: `${Number(t.toFixed(1))}s` })
  }
  return marks
})

const ICONS: Record<Layer['kind'], string> = {
  component: 'i-lucide-square-play',
  video: 'i-lucide-film',
  image: 'i-lucide-image',
  text: 'i-lucide-type',
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`
</script>

<template>
  <div class="flex shrink-0 flex-col border-t border-zinc-900 bg-black">
    <div class="flex items-center gap-2 border-b border-zinc-900/80 px-3 py-2">
      <button
        type="button"
        class="flex size-7 shrink-0 items-center justify-center border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
        :title="playing ? 'Pause (space)' : 'Play (space)'"
        @click="emit('togglePlay')"
      >
        <UIcon :name="playing ? 'i-lucide-pause' : 'i-lucide-play'" class="size-3.5" />
      </button>

      <span class="font-mono text-[11px] tabular-nums text-zinc-200">{{ seconds(playhead) }}</span>
      <span class="font-mono text-[10px] text-zinc-600">/ {{ seconds(length) }}</span>

      <span class="ml-2 font-mono text-[10px] text-zinc-600">
        {{ frames }} frames · {{ seconds(outputMs) }} out
      </span>

      <div class="ml-auto flex items-center gap-1">
        <!--
          Everything that produces pixels is media: a built-in animation is a
          source like a file is, not a category of its own. What gets *added* to
          media is motion, and that lives in the animation list on each clip.
        -->
        <div class="relative">
          <button
            type="button"
            class="border px-2 py-1 font-mono text-[10px] transition-colors"
            :class="mediaMenu
              ? 'border-blue-500/60 text-blue-300'
              : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'"
            @pointerdown.stop
            @click="mediaMenu = !mediaMenu"
          >
            + media
          </button>
          <div
            v-if="mediaMenu"
            class="absolute bottom-full right-0 z-50 mb-1 min-w-44 border border-zinc-800 bg-zinc-950 py-1 shadow-xl"
            @pointerdown.stop
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
              @click="mediaMenu = false; emit('addComponent')"
            >
              <UIcon name="i-lucide-square-play" class="size-3 text-zinc-600" />
              Built-in animation
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
              @click="mediaMenu = false; emit('addImage')"
            >
              <UIcon name="i-lucide-image" class="size-3 text-zinc-600" />
              Image or video…
            </button>
          </div>
        </div>
        <button
          type="button"
          class="border border-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
          @click="emit('addText')"
        >
          + text
        </button>
      </div>
    </div>

    <div class="relative flex max-h-52 min-h-0 overflow-y-auto">
      <!-- Track names, held out of the scrolling time area so they stay readable. -->
      <div class="w-36 shrink-0 border-r border-zinc-900 bg-black">
        <div class="flex h-7 items-center px-3 font-mono text-[10px] text-zinc-600">
          timeline
        </div>
        <button
          v-for="layer in layers"
          :key="layer.id"
          type="button"
          class="flex h-8 w-full items-center gap-1.5 px-3 text-left transition-colors"
          :class="selectedId === layer.id ? 'bg-blue-500/10' : 'hover:bg-zinc-900/60'"
          @click="emit('select', layer.id)"
        >
          <UIcon
            :name="ICONS[layer.kind]"
            class="size-3 shrink-0"
            :class="selectedId === layer.id ? 'text-blue-300' : 'text-zinc-600'"
          />
          <span
            class="truncate font-mono text-[10px]"
            :class="selectedId === layer.id ? 'text-blue-200' : 'text-zinc-400'"
          >{{ layer.name }}</span>
        </button>
      </div>

      <div class="relative min-w-0 flex-1">
        <!-- The ruler owns the pointer geometry; every time below is measured against it. -->
        <div
          ref="ruler"
          class="relative h-7 cursor-ew-resize select-none border-b border-zinc-900 bg-zinc-950"
          @pointerdown="startDrag($event, { kind: 'playhead' })"
          @pointermove="applyDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
        >
          <!-- Past the take: scrubbing room, never exported. -->
          <div class="pointer-events-none absolute inset-y-0 right-0 bg-black/50" :style="{ left: `${percent(length)}%` }" />
          <div class="pointer-events-none absolute inset-y-0 w-px bg-zinc-700" :style="{ left: `${percent(length)}%` }" />

          <div
            v-for="tick in ticks"
            :key="tick.at"
            class="pointer-events-none absolute bottom-0 flex h-full flex-col justify-end"
            :style="{ left: `${tick.at}%` }"
          >
            <span class="absolute bottom-2.5 left-1 font-mono text-[9px] text-zinc-600">{{ tick.label }}</span>
            <div class="h-1.5 w-px bg-zinc-700" />
          </div>

        </div>

        <div class="relative">
          <div
            v-for="layer in layers"
            :key="layer.id"
            class="relative h-8 border-b border-zinc-900/60"
            @pointerdown="emit('select', null)"
          >
            <div
              class="absolute top-1.5 h-5 cursor-grab select-none border transition-colors"
              :class="[
                selectedId === layer.id
                  ? 'border-blue-400/80 bg-blue-500/25'
                  : 'border-zinc-700 bg-zinc-800/70 hover:border-zinc-500',
                drag?.kind === 'clip' && drag.id === layer.id ? 'cursor-grabbing' : '',
              ]"
              :style="{ left: `${percent(layer.start)}%`, width: `${percent(layerEnd(layer)) - percent(layer.start)}%` }"
              @pointerdown="onClipDown($event, layer, 'body')"
              @pointermove="applyDrag"
              @pointerup="endDrag"
              @pointercancel="endDrag"
              @pointerenter="hoveredId = layer.id"
              @pointerleave="hoveredId = null"
              @contextmenu.prevent.stop="openMenu($event, layer)"
            >
              <span class="pointer-events-none block truncate px-1.5 font-mono text-[9px] leading-5 text-zinc-200">
                {{ layer.name }}
              </span>

              <!-- Drawn, not just hoverable: a handle you cannot see is a handle you cannot aim at. -->
              <div
                class="absolute inset-y-0 left-0 w-1.5 cursor-col-resize transition-colors"
                :class="hoveredId === layer.id || selectedId === layer.id ? 'bg-blue-400/70' : 'bg-zinc-600/60'"
                @pointerdown="onClipDown($event, layer, 'start')"
                @pointermove="applyDrag"
                @pointerup="endDrag"
                @pointercancel="endDrag"
              />
              <div
                class="absolute inset-y-0 right-0 w-1.5 cursor-col-resize transition-colors"
                :class="hoveredId === layer.id || selectedId === layer.id ? 'bg-blue-400/70' : 'bg-zinc-600/60'"
                @pointerdown="onClipDown($event, layer, 'end')"
                @pointermove="applyDrag"
                @pointerup="endDrag"
                @pointercancel="endDrag"
              />

              <!-- Fades, shown as the ramps they are. -->
              <div
                v-if="layer.fadeIn > 0"
                class="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-black/60 to-transparent"
                :style="{ width: `${Math.min(100, (layer.fadeIn / layer.duration) * 100)}%` }"
              />
              <div
                v-if="layer.fadeOut > 0"
                class="pointer-events-none absolute inset-y-0 right-0 bg-gradient-to-l from-black/60 to-transparent"
                :style="{ width: `${Math.min(100, (layer.fadeOut / layer.duration) * 100)}%` }"
              />
            </div>
          </div>
        </div>

        <!-- Trim handles and playhead span every track, so alignment is visible at a glance. -->
        <div class="pointer-events-none absolute inset-0">
          <div
            class="absolute inset-y-0 w-px"
            :class="seeking ? 'bg-amber-400' : 'bg-zinc-100'"
            :style="{ left: `${percent(playhead)}%` }"
          />
        </div>


        <div
          class="pointer-events-none absolute top-0 size-2 -translate-x-1/2"
          :class="seeking ? 'bg-amber-400' : 'bg-zinc-100'"
          :style="{ left: `${percent(playhead)}%` }"
        />
      </div>
    </div>

    <!--
      Fixed rather than nested in the track, so the menu is never clipped by the
      timeline's own scroll container.
    -->
    <Teleport to="body">
      <div
        v-if="menu"
        ref="menuEl"
        class="fixed z-200 min-w-40 border border-zinc-800 bg-zinc-950 py-1 shadow-xl"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        @pointerdown.stop
        @contextmenu.prevent
      >
        <button
          v-for="item in [
            { key: 'duplicate', label: 'Duplicate', hint: '⌘D', enabled: true },
            { key: 'copy', label: 'Copy', hint: '⌘C', enabled: true },
            { key: 'split', label: 'Split at playhead', hint: '', enabled: canSplit },
            { key: 'remove', label: 'Delete', hint: '⌫', enabled: true },
          ]"
          :key="item.key"
          type="button"
          class="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left font-mono text-[11px] transition-colors"
          :class="item.enabled
            ? 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
            : 'cursor-not-allowed text-zinc-700'"
          :disabled="!item.enabled"
          @click="run(item.key as 'duplicate' | 'copy' | 'split' | 'remove')"
        >
          <span>{{ item.label }}</span>
          <span class="text-zinc-600">{{ item.hint }}</span>
        </button>
        <div class="my-1 border-t border-zinc-900" />
        <button
          type="button"
          class="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
          @click="closeMenu(); emit('paste')"
        >
          <span>Paste at playhead</span>
          <span class="text-zinc-600">⌘V</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>
