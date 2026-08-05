/**
 * Flags arrive as parser keys — `minScore`, `write`, `all` — paired with a value
 * that is a boolean, a number, or the `<set>` sentinel a value-carrying option
 * leaves behind. Rendered literally that reads as a config object, and the
 * question a reader actually has ("what did they type?") takes a translation
 * step every time.
 *
 * So render the command line back: `--min-score 90`, `--no-write`, `--all`.
 */

/** Sentinel written by `@evlog/telemetry` for a string flag whose value is not collected. */
const VALUE_SET = '<set>'

/** `minScore` → `--min-score`. */
export function flagName(key: string): string {
  return `--${key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`
}

/**
 * The flag as it was typed, as far as the payload can tell.
 *
 * A boolean spells itself: `--all` when on, `--no-write` when off — that is the
 * argv a CLI with a defaulted-on flag actually receives, so it is what the
 * reader recognises. A number keeps its value. A collected string value shows
 * it; an uncollected one is marked rather than shown, because pretending we
 * have it is worse than admitting we deliberately do not.
 */
export function flagLabel(key: string, value: boolean | number | string): string {
  const name = flagName(key)
  if (value === true) return name
  if (value === false) return `--no-${name.slice(2)}`
  if (value === VALUE_SET) return `${name} …`
  return `${name} ${value}`
}

/** Whether a flag value is the "a value was passed, we did not collect it" sentinel. */
export function isValueSet(value: boolean | number | string): boolean {
  return value === VALUE_SET
}
