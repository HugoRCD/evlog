/**
 * The catalogue of stageable components.
 *
 * Built from a glob rather than a hand-written list: every animation added to
 * `content/` or `features/` shows up in the lab on its own, and one that gets
 * deleted stops being an option instead of becoming a broken entry.
 */

import { defineAsyncComponent } from 'vue'
import type { Component } from 'vue'

// Reaching into the docs app on purpose: the animations stay where they are
// maintained, and the lab films the same files the site ships.
const modules = {
  ...import.meta.glob('../../../../docs/app/components/content/*.vue'),
  ...import.meta.glob('../../../../docs/app/components/features/*.vue'),
} as Record<string, () => Promise<{ default: Component }>>

export interface LabEntry {
  /** File name without extension, e.g. `MapScoreClimb`. The URL key. */
  name: string
  /** `content` or `features`. */
  group: string
  /** Spaced-out name for the picker. */
  label: string
  load: () => Promise<{ default: Component }>
}

/** `MapScoreClimb` → `Map Score Climb`, so the picker is scannable. */
function humanize(name: string): string {
  return name.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
}

export const ENTRIES: LabEntry[] = Object.entries(modules)
  .map(([path, load]) => {
    const name = path.split('/').pop()?.replace(/\.vue$/, '') ?? ''
    const group = path.includes('/features/') ? 'features' : 'content'
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
