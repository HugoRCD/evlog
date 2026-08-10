import type { LayerEffect } from '~/utils/lab/effects'
import type { Layer } from '~/utils/lab/layers'
import type { LabSettings } from '~/utils/lab/settings'
import type { LabMode } from '~/utils/lab/storage'

/**
 * Undo and redo, over the document rather than over the actions.
 *
 * A command log would need an inverse written for every editing action in the
 * app, and the actions most in need of undoing — clear everything, reset
 * settings, a drop that landed four clips at once — are exactly the ones whose
 * inverse is a whole document anyway. The document is already the only thing
 * that describes a shot, so history is snapshots of it and nothing else has to
 * know history exists.
 *
 * Entries are taken on a trailing debounce, so dragging a control the width of
 * the panel is one entry holding the value the drag landed on, rather than two
 * hundred entries holding every value it passed through.
 */

export interface LabHistoryState {
  /** Which kind of document this was — an undo must not change the tool. */
  mode: LabMode
  settings: LabSettings
  layers: Layer[]
  camera: LayerEffect[]
}

/**
 * How far back it goes.
 *
 * Deep enough to walk out of a grading session; bounded because the alternative
 * is a tab that grows for as long as it is left open.
 */
const MAX_ENTRIES = 120

/** Quiet time before an edit counts as finished and becomes an entry. */
const COMMIT_DELAY = 400

/**
 * Copied one level deeper than the document nests, and no deeper.
 *
 * Deliberately not `structuredClone`: imported media lives in the document as a
 * data URL, so one clip makes every snapshot megabytes of string — times a
 * hundred and twenty. Spreading copies the reference instead, and a string
 * cannot be edited in place, so a hundred snapshots sharing one `src` are
 * exactly as safe as a hundred that each own a copy of it.
 */
function snapshot(state: LabHistoryState): LabHistoryState {
  return {
    mode: state.mode,
    settings: { ...state.settings },
    layers: state.layers.map(layer => ({ ...layer, effects: layer.effects.map(effect => ({ ...effect })) })),
    camera: state.camera.map(effect => ({ ...effect })),
  }
}

/**
 * Structural equality, one value at a time.
 *
 * Not `JSON.stringify` on both sides: stringifying a document carrying a data
 * URL, twice a second while somebody drags a slider, is real work for a question
 * that is nearly always settled by the first field that differs. Comparing
 * values short-circuits, and two snapshots that share a `src` settle it by
 * reference without reading the string at all.
 */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((entry, index) => same(entry, b[index]))
  }
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every(key => same((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

/**
 * @param read Live document. Returned by reference — it is snapshotted here.
 * @param write Puts a document back. Receives a copy it may keep or mutate.
 */
export function useLabHistory(read: () => LabHistoryState, write: (state: LabHistoryState) => void) {
  const past = shallowRef<LabHistoryState[]>([])
  const future = shallowRef<LabHistoryState[]>([])
  /**
   * The last state that was recorded, which is also the state the live document
   * is expected to be in. Comparing against it is what stops an undo from being
   * recorded as another edit: after one, the document already matches.
   */
  let committed = snapshot(read())
  /**
   * An edit has arrived and its entry has not been taken yet.
   *
   * Optimistic — the watcher does not check whether anything really changed,
   * because that check belongs on the commit and not on every pointer move. The
   * cost of being wrong is an Undo that looks available for a few hundred
   * milliseconds and does nothing.
   */
  const pending = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  function commit() {
    clearTimeout(timer)
    pending.value = false
    const current = read()
    if (same(current, committed)) return
    // Oldest first, so dropping the overflow is a slice off the front.
    past.value = [...past.value, committed].slice(-MAX_ENTRIES)
    // Editing after undoing abandons what was undone. Keeping it would mean
    // Redo restoring a state this document no longer descends from.
    future.value = []
    committed = snapshot(current)
  }

  watch(read, () => {
    pending.value = true
    clearTimeout(timer)
    timer = setTimeout(commit, COMMIT_DELAY)
  }, { deep: true })

  /**
   * Written back as a copy.
   *
   * The live settings object is mutated in place by the controls that edit it,
   * so handing out the stored entry itself would let the next slider drag edit
   * the past.
   */
  function apply(state: LabHistoryState) {
    committed = state
    write(snapshot(state))
  }

  function undo() {
    // An edit still inside the debounce window is a state nobody has recorded.
    // Commit it first, or the first undo discards it rather than reversing it.
    commit()
    const previous = past.value.at(-1)
    if (!previous) return
    past.value = past.value.slice(0, -1)
    future.value = [...future.value, committed]
    apply(previous)
  }

  function redo() {
    // Same reason as above, and harmless here: a commit only clears the redo
    // stack when it actually records something, which is the case where the
    // document has branched and the redo stack is wrong anyway.
    commit()
    const next = future.value.at(-1)
    if (!next) return
    future.value = future.value.slice(0, -1)
    past.value = [...past.value, committed]
    apply(next)
  }

  onBeforeUnmount(() => clearTimeout(timer))

  return {
    undo,
    redo,
    canUndo: computed(() => past.value.length > 0 || pending.value),
    canRedo: computed(() => future.value.length > 0),
  }
}
