/**
 * The catalogue of stageable components.
 *
 * Built from globs rather than a hand-written list: a component added to a
 * configured source shows up in the lab on its own, and one that gets deleted
 * stops being an option instead of becoming a broken entry.
 *
 * The globs themselves are declared in `nuxt.config` and resolved by
 * `modules/stages.ts`. Nothing here knows which project is being filmed, which
 * is what lets this be pointed at any component library rather than only at the
 * one it grew up next to.
 */

import { defineAsyncComponent } from 'vue'
import type { Component } from 'vue'
import { STAGE_MODULES } from '#render-labs/stages'

export interface LabEntry {
  /** File name without extension, e.g. `MapScoreClimb`. The URL key. */
  name: string
  /** The source this came from, as named in the config. */
  group: string
  /** Spaced-out name for the picker. */
  label: string
  load: () => Promise<{ default: Component }>
}

/** `MapScoreClimb` → `Map Score Climb`, so the picker is scannable. */
function humanize(name: string): string {
  return name.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

export const ENTRIES: LabEntry[] = Object.entries(STAGE_MODULES)
  .map(([path, { group, load }]) => {
    const name = path.split('/').pop()?.replace(/\.vue$/, '') ?? ''
    return { name, group, label: humanize(name), load }
  })
  .filter(entry => entry.name)
  .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))

const cache = new Map<string, Component>()

export function resolveEntry(name: string): Component | null {
  const entry = ENTRIES.find(candidate => candidate.name === name)
  if (!entry) return null
  let component = cache.get(name)
  if (!component) {
    component = defineAsyncComponent(entry.load)
    cache.set(name, component)
  }
  return component
}

export const DEFAULT_COMPONENT = ENTRIES.find(entry => entry.name === 'MapScoreClimb')?.name
  ?? ENTRIES[0]?.name
  ?? ''
