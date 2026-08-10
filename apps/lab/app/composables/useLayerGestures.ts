/**
 * Moving, sizing and turning a layer by dragging it.
 *
 * The camera already worked this way — see `useCameraGestures` — and the layers
 * did not, which left the tool with two vocabularies for the same act. Placing
 * something meant dragging a number field, looking up to see where it went, and
 * correcting; the frame was the only place either coordinate meant anything, and
 * it was the one place you could not touch them.
 *
 * The arithmetic differs by where a layer lives, and that difference is the
 * whole of this file. An overlay is pinned to the frame, so a drag across the
 * frame is the displacement. A layer in the scene is a plane in perspective, so
 * the same drag has to be converted through the depth it sits at — otherwise a
 * layer pushed back slides out from under the pointer instead of with it.
 */

import type { Layer } from '~/utils/lab/layers'
import { layerDepth } from '~/utils/lab/layers'
import type { LabSettings } from '~/utils/lab/settings'

/** A point on the frame, as a fraction with y down — what the frame element reports. */
export interface FramePoint {
  x: number
  y: number
}

export type LayerGrab =
  | { kind: 'move' }
  | { kind: 'resize', corner: number }
  | { kind: 'rotate' }

interface Session {
  grab: LayerGrab
  /** The layer as it was when the drag started, so every step is absolute. */
  origin: Layer
  start: FramePoint
  /** Frame-fraction centre of the layer at the start, for size and angle. */
  centre: FramePoint
}

export interface LayerGestures {
  readonly active: Readonly<Ref<boolean>>
  begin: (layer: Layer, grab: LayerGrab, point: FramePoint, centre: FramePoint) => void
  move: (point: FramePoint) => void
  end: () => void
}

/** Smallest a layer may be dragged to. Below this the handles overlap and it cannot be grown back. */
const MIN_WIDTH = 0.02

export interface LayerGesturesOptions {
  settings: Ref<LabSettings>
  /**
   * World units one whole frame spans at a layer's depth, or null while the
   * renderer has not been built. Scene layers are placed in world units; this is
   * the only way a gesture on the frame can reach them.
   */
  worldPerFrame: (depth: number) => { x: number, y: number } | null
  /** Stage aspect, which is the unit scene layers measure their placement in. */
  stageAspect: Ref<number>
  apply: (id: string, patch: Partial<Layer>) => void
}

export function useLayerGestures(options: LayerGesturesOptions): LayerGestures {
  const session = shallowRef<Session | null>(null)
  const active = computed(() => session.value !== null)

  /**
   * A displacement on the frame, in whatever units the layer is placed in.
   *
   * Overlays are already stated as frame fractions, so the drag is the answer.
   * Scene layers are stated as stage fractions that the renderer turns into
   * world offsets, so the drag has to go out to world through the depth and back
   * into stage fractions — which is why this is not one multiplication.
   */
  function displace(layer: Layer, dx: number, dy: number): { x: number, y: number } | null {
    if (layer.space === 'overlay') return { x: dx, y: dy }

    const world = options.worldPerFrame(layerDepth(layer))
    if (!world) return null
    const aspect = options.stageAspect.value
    return {
      x: (dx * world.x) / (2 * aspect),
      // Frame y runs down and the scene's runs up, and the stage's own
      // placement runs down again — the two flips cancel to none.
      y: (dy * world.y) / 2,
    }
  }

  function begin(layer: Layer, grab: LayerGrab, point: FramePoint, centre: FramePoint) {
    session.value = { grab, origin: { ...layer }, start: point, centre }
  }

  function move(point: FramePoint) {
    const current = session.value
    if (!current) return
    const { grab, origin, start, centre } = current

    if (grab.kind === 'move') {
      const shift = displace(origin, point.x - start.x, point.y - start.y)
      if (!shift) return
      options.apply(origin.id, { x: origin.x + shift.x, y: origin.y + shift.y })
      return
    }

    if (grab.kind === 'rotate') {
      const from = Math.atan2(start.y - centre.y, start.x - centre.x)
      const to = Math.atan2(point.y - centre.y, point.x - centre.x)
      // Negated because the frame's y runs down: turning the pointer clockwise
      // on screen has to read as a clockwise turn of the layer.
      const degrees = -((to - from) * 180) / Math.PI
      options.apply(origin.id, { rotation: Number((origin.rotation + degrees).toFixed(1)) })
      return
    }

    /*
     * Resize about the centre, from how far the corner travelled relative to
     * how far away it already was.
     *
     * A ratio rather than a delta, because the corner's distance is the only
     * measure of size available on screen that survives the layer being tilted
     * and turned — the projected box has no side whose length means anything on
     * its own.
     */
    const before = Math.hypot(start.x - centre.x, start.y - centre.y)
    if (before < 1e-4) return
    const after = Math.hypot(point.x - centre.x, point.y - centre.y)
    const width = Math.max(MIN_WIDTH, origin.width * (after / before))
    options.apply(origin.id, { width: Number(width.toFixed(4)) })
  }

  function end() {
    session.value = null
  }

  return { active, begin, move, end }
}
