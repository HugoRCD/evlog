<script setup lang="ts">
/**
 * The plate's own axes, drawn as a small orientation gizmo.
 *
 * Three numbers describe the camera — pitch, yaw and roll — and none of them
 * tells you which way you are looking. Read back after a few drags they are
 * three values in the panel with no picture attached, and the usual way to find
 * out where you ended up is to reset the framing and start again.
 *
 * So this is the readout, and the shortcut. It draws the same basis the renderer
 * builds, and clicking a ball puts the camera square onto that axis — the thing
 * every 3D viewport has, for the same reason.
 */
import { rotationMatrix } from '~/utils/lab/renderer'

const props = defineProps<{
  pitch: number
  yaw: number
  roll: number
}>()

const emit = defineEmits<{ snap: [pitch: number, yaw: number] }>()

const DEGREES = Math.PI / 180

/**
 * The six ends of the three axes.
 *
 * Both ends of each, because a gizmo that only drew the positive half would go
 * blank as soon as an axis pointed away — which is exactly when you most need
 * to know it is there.
 *
 * The colours are the convention every 3D tool shares: X red, Y green, Z blue.
 * Borrowing it means the widget needs no legend.
 */
const AXES = [
  { label: 'X', local: [1, 0, 0], colour: '#f87171', pitch: 0, yaw: 90 },
  { label: 'X', local: [-1, 0, 0], colour: '#f87171', pitch: 0, yaw: -90, minor: true },
  { label: 'Y', local: [0, 1, 0], colour: '#a3e635', pitch: -60, yaw: 0 },
  { label: 'Y', local: [0, -1, 0], colour: '#a3e635', pitch: 60, yaw: 0, minor: true },
  { label: 'Z', local: [0, 0, 1], colour: '#60a5fa', pitch: 0, yaw: 0 },
  { label: 'Z', local: [0, 0, -1], colour: '#60a5fa', pitch: 0, yaw: 180, minor: true },
] as const

/**
 * Projected orthographically, and sorted back to front.
 *
 * Orthographic because a gizmo is a compass rather than a scene — perspective
 * on something twenty pixels across only makes the near ball wobble. Depth is
 * kept anyway: it decides the draw order and dims the ends pointing away, which
 * is the whole of the 3D read.
 */
const balls = computed(() => {
  const basis = rotationMatrix(props.pitch * DEGREES, props.yaw * DEGREES, props.roll * DEGREES)

  return AXES.map((axis) => {
    const [lx, ly, lz] = axis.local
    // Column-major, matching the renderer and the shader.
    const x = (basis[0] ?? 0) * lx + (basis[3] ?? 0) * ly + (basis[6] ?? 0) * lz
    const y = (basis[1] ?? 0) * lx + (basis[4] ?? 0) * ly + (basis[7] ?? 0) * lz
    const z = (basis[2] ?? 0) * lx + (basis[5] ?? 0) * ly + (basis[8] ?? 0) * lz
    return {
      ...axis,
      // Screen y runs down while the scene's runs up.
      left: 50 + x * 34,
      top: 50 - y * 34,
      depth: z,
    }
  }).sort((a, b) => a.depth - b.depth)
})
</script>

<template>
  <div class="relative size-[76px]" aria-label="Camera orientation">
    <svg class="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100">
      <!--
        A spoke per end, from the centre. Without them the balls read as six
        loose dots rather than as three axes through one origin.
      -->
      <line
        v-for="(ball, index) in balls"
        :key="`spoke-${index}`"
        x1="50"
        y1="50"
        :x2="ball.left"
        :y2="ball.top"
        :stroke="ball.colour"
        :stroke-opacity="ball.depth > 0 ? 0.55 : 0.25"
        stroke-width="1.5"
      />
    </svg>

    <button
      v-for="(ball, index) in balls"
      :key="index"
      type="button"
      data-cuelume-press
      class="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[8px] font-medium leading-none transition-transform hover:scale-125"
      :class="ball.minor ? 'size-3' : 'size-4'"
      :style="{
        left: `${ball.left}%`,
        top: `${ball.top}%`,
        // Filled when it points at you, hollow when it points away — the same
        // language a viewport cube uses, and the only cue that survives at this
        // size without a label on every ball.
        backgroundColor: ball.minor ? 'rgba(0,0,0,0.65)' : ball.colour,
        borderColor: ball.colour,
        color: ball.minor ? ball.colour : '#000',
        opacity: ball.depth > 0 ? 1 : 0.55,
      }"
      :title="`Look down ${ball.label}`"
      @click="emit('snap', ball.pitch, ball.yaw)"
    >
      <span v-if="!ball.minor">{{ ball.label }}</span>
    </button>
  </div>
</template>
