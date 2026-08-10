/**
 * Interaction sounds, and the one switch that turns them off.
 *
 * Cuelume synthesizes each cue live, so there is nothing to load and nothing to
 * host — a press is a shaped envelope on an oscillator rather than a file. What
 * it deliberately does not do is remember whether you wanted any of it: the
 * preference belongs to the app, which is this file.
 *
 * That switch is not a nicety here. This tool exists to record things, and the
 * people using it are often recording their own screen while they do — a lab
 * that chirps under a take being narrated is a lab that ruins it. So the toggle
 * is in the header rather than down a settings panel, and the choice survives
 * the tab.
 */

import { bind, play, setEnabled, setVolume } from 'cuelume'
import type { SoundName } from 'cuelume'

const KEY = 'render-labs:cues'

/**
 * Quiet enough to sit under a working session.
 *
 * The palette is mixed to be audible on its own, which is louder than something
 * firing on every slider step has any business being.
 */
const VOLUME = 0.35

/**
 * Shortest gap between two cues of the same kind, in milliseconds.
 *
 * A slider drag emits a value change per frame. Played straight through that is
 * sixty cues a second — a machine gun rather than a texture — and the Web Audio
 * graph ends up with sixty overlapping envelopes competing for the same
 * headroom. Rate-limiting per sound keeps a drag as a run of ticks while
 * leaving two different cues free to overlap, which is what makes a press and
 * the confirmation after it read as two events.
 */
const THROTTLE_MS = 55

const enabled = ref(true)
const lastPlayed = new Map<SoundName, number>()

let ready = false

export function useCues() {
  /**
   * Wire the delegated listeners once, under the chrome only.
   *
   * Never the whole document: the stage is a live DOM subtree being rasterized
   * every frame, and it is the one part of this page that is not an interface.
   * Sound belongs to the tool, not to the thing the tool is pointed at.
   */
  function install(root: ParentNode) {
    if (ready) return
    ready = true

    // Read before binding, so a session that muted last time stays quiet
    // through the first hover rather than announcing itself and then stopping.
    try {
      enabled.value = localStorage.getItem(KEY) !== 'off'
    } catch {
      // Private browsing. Sound on is the better guess for a tool nobody has
      // told us anything about.
    }

    setVolume(VOLUME)
    setEnabled(enabled.value)
    bind(root)
  }

  function setCuesEnabled(value: boolean) {
    enabled.value = value
    setEnabled(value)
    try {
      localStorage.setItem(KEY, value ? 'on' : 'off')
    } catch {
      // The preference is lost on reload; the session still respects it.
    }
    // Played after the switch so turning sound *on* confirms itself, and
    // turning it off is silent — which is the answer the click asked for.
    if (value) play('toggle')
  }

  /**
   * Play a cue, no more often than the throttle allows for that cue.
   *
   * `performance.now` is patched by the lab's virtual clock while a take is
   * being stepped, and it freezes when the playhead does — which would let
   * every cue through at once during an export. `Date.now` is nobody's clock
   * but the wall's, which is the right one for a sound in the room.
   */
  function cue(sound: SoundName) {
    if (!enabled.value) return
    const now = Date.now()
    if (now - (lastPlayed.get(sound) ?? 0) < THROTTLE_MS) return
    lastPlayed.set(sound, now)
    play(sound)
  }

  return { enabled: readonly(enabled), install, setCuesEnabled, cue }
}
