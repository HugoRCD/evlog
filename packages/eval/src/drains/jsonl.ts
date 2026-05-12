import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DrainFn } from '../types'

/**
 * Options for `jsonlDrain`.
 */
export interface JsonlDrainOptions {
  /**
   * Path to write the NDJSON file.
   * @default `.evlog/evals/{evalName}.jsonl` (derived from `event.eval.name`)
   */
  path?: string
}

/**
 * Drain eval results to a local NDJSON file.
 *
 * Each eval case wide event is appended as a single JSON line — making
 * the output git-diffable and easy to compare across runs.
 *
 * The file is created (along with parent directories) if it does not exist.
 *
 * @example
 * ```ts
 * import { jsonlDrain } from '@evlog/eval/drains'
 *
 * // Auto-path: .evlog/evals/{evalName}.jsonl
 * drain: jsonlDrain()
 *
 * // Custom path
 * drain: jsonlDrain({ path: './results/my-eval.jsonl' })
 * ```
 */
export function jsonlDrain(options: JsonlDrainOptions = {}): DrainFn {
  return ({ event }) => {
    const evalName = (event.eval as { name?: string } | undefined)?.name ?? 'eval'
    const filePath = options.path ?? join(process.cwd(), '.evlog', 'evals', `${evalName}.jsonl`)

    try {
      mkdirSync(dirname(filePath), { recursive: true })
      appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8')
    } catch (err) {
      console.error('[evlog/eval] jsonlDrain write error:', err)
    }
  }
}
