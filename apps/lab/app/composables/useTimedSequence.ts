/**
 * Re-export of the docs sequencer.
 *
 * The staged components import it as `~/composables/useTimedSequence`, and `~`
 * resolves to whichever app is running them — so this app has to answer at that
 * path. Re-exporting rather than copying keeps one implementation: the lab
 * steps the very same clock the docs site does.
 */
export * from '../../../docs/app/composables/useTimedSequence'
