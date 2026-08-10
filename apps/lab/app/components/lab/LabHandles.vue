<script setup lang="ts">
/**
 * The selection box, drawn on the frame over the layer it belongs to.
 *
 * Placing a layer used to mean dragging an X field and a Y field and looking up
 * after each to see where it went — two numbers standing in for one gesture,
 * with the frame as the only place either of them means anything. This is that
 * gesture.
 *
 * The outline is a general quadrilateral rather than a rectangle, and that is
 * the whole reason it is drawn as a polygon: a layer in the scene is a plane in
 * perspective, so under any tilt its projection has four unequal sides. A box
 * with a centre and a size would be square to the screen while the thing it
 * claims to surround is not, which is worse than no box at all.
 */
const props = defineProps<{
  /** The layer's four corners as frame fractions, y down. */
  corners: [number, number][]
}>()

const emit = defineEmits<{
  grabCorner: [index: number, event: PointerEvent]
  grabRotate: [event: PointerEvent]
}>()

const points = computed(() => props.corners.map(([x, y]) => `${x * 100},${y * 100}`).join(' '))

const centre = computed(() => {
  const sum = props.corners.reduce(([x, y], [cx, cy]) => [x + cx, y + cy], [0, 0])
  return { x: sum[0] / props.corners.length, y: sum[1] / props.corners.length }
})

/**
 * The rotate grip, pushed off the top edge along its own outward normal.
 *
 * Perpendicular to the edge rather than straight up the screen, so it stays
 * where the hand expects it once the layer is turned — a grip that always sat
 * above the box would cross the shape as soon as the shape was upside down.
 */
const rotateGrip = computed(() => {
  const [a, b] = props.corners
  if (!a || !b) return null
  const midX = (a[0] + b[0]) / 2
  const midY = (a[1] + b[1]) / 2
  const dx = midX - centre.value.x
  const dy = midY - centre.value.y
  const length = Math.hypot(dx, dy) || 1
  return { x: midX + (dx / length) * 0.05, y: midY + (dy / length) * 0.05, midX, midY }
})
</script>

<template>
  <!--
    `pointer-events-none` on the surface and back on for each grip: the box has
    to be visible over the whole layer without stealing the drag that moves it.
  -->
  <svg
    class="pointer-events-none absolute inset-0 size-full overflow-visible"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
  >
    <polygon
      :points
      fill="none"
      stroke="rgb(96 165 250)"
      stroke-width="0.15"
      vector-effect="non-scaling-stroke"
    />
    <line
      v-if="rotateGrip"
      :x1="rotateGrip.midX * 100"
      :y1="rotateGrip.midY * 100"
      :x2="rotateGrip.x * 100"
      :y2="rotateGrip.y * 100"
      stroke="rgb(96 165 250)"
      stroke-width="0.15"
      vector-effect="non-scaling-stroke"
    />
  </svg>

  <!--
    The grips are elements rather than SVG shapes because they have to keep a
    fixed size in pixels: a handle that shrank with the layer would vanish on
    the shots that need placing most.
  -->
  <button
    v-for="(corner, index) in corners"
    :key="index"
    type="button"
    class="absolute size-2 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize border border-blue-400 bg-black"
    :style="{ left: `${corner[0] * 100}%`, top: `${corner[1] * 100}%` }"
    :aria-label="`Resize from corner ${index + 1}`"
    @pointerdown.stop="emit('grabCorner', index, $event)"
  />
  <button
    v-if="rotateGrip"
    type="button"
    class="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-blue-400 bg-black"
    :style="{ left: `${rotateGrip.x * 100}%`, top: `${rotateGrip.y * 100}%` }"
    aria-label="Rotate the layer"
    @pointerdown.stop="emit('grabRotate', $event)"
  />
</template>
