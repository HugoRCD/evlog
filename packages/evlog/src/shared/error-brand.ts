/**
 * Prototype brand read by {@link isEvlogError}. `instanceof` compares class
 * identity, which differs between duplicate installs of evlog, a
 * registry-shared symbol does not.
 *
 * @internal
 */
export const evlogErrorBrand = Symbol.for('evlog.error.brand')

/**
 * Whether `error` is an `EvlogError`, including one thrown by a different copy
 * of evlog. Kept out of `error.ts` so browser-side callers such as `parseError`
 * can ask the question without pulling the class into their bundle.
 *
 * @internal Use `EvlogError.isEvlogError` from application code.
 */
export function isEvlogError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && (error as Record<symbol, unknown>)[evlogErrorBrand] === true
}
