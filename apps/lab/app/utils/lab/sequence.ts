/**
 * How long a staged animation says it runs for.
 *
 * The doc components are driven by `useTimedSequence`, and every one of them
 * hands it a `totalDuration` — the length of one cycle, tail hold included. That
 * number is the answer to "how long is this animation", and it was sitting one
 * function call away from a lab that was guessing two seconds.
 *
 * So the lab listens rather than measures. Nothing is inspected, no keyframe is
 * sniffed: the component states its own length on the way past, and the clip is
 * cut to it. Components that drive themselves some other way report nothing and
 * keep the default span — better than a number derived from watching them.
 */

import type { InjectionKey } from 'vue'

/**
 * The clip a staged component belongs to, provided per stage.
 *
 * Injection rather than a "currently mounting" global: Vue renders every stage in
 * one pass, so there is no moment that belongs to exactly one of them. The
 * component tree, on the other hand, knows precisely which stage it sits under.
 */
export const LAB_STAGE_LAYER: InjectionKey<string> = Symbol('lab:stage-layer')

const durations = ref<Record<string, number>>({})

/** Called from the lab's `useTimedSequence` wrapper, during a staged setup. */
export function reportSequenceDuration(layerId: string, totalDuration: number): void {
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) return
  const rounded = Math.round(totalDuration)
  if (durations.value[layerId] === rounded) return
  durations.value = { ...durations.value, [layerId]: rounded }
}

/** Lengths reported so far, keyed by clip id. */
export function useSequenceDurations() {
  return readonly(durations)
}
