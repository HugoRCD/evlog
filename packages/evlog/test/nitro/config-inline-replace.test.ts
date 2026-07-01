import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'acorn'
import { describe, expect, it } from 'vitest'

const INLINE_REPLACE_TOKEN = '__EVLOG_CONFIG__'

const NITRO_INLINE_SOURCES = [
  '../../src/shared/nitroConfigBridge.ts',
  '../../src/logger.ts',
] as const

/** Simulate Nitro's global textual `nitro.options.replace` substitution. */
function applyNitroInlineReplace(source: string, config: Record<string, unknown>): string {
  return source.replaceAll(INLINE_REPLACE_TOKEN, JSON.stringify(config))
}

/** Extract block comments from source (JSDoc and multiline slash-star comments). */
function extractBlockComments(source: string): string[] {
  const comments: string[] = []
  const pattern = /\/\*[\s\S]*?\*\//g
  for (const match of source.matchAll(pattern)) {
    comments.push(match[0])
  }
  return comments
}

/** JS stand-in for runtime expression sites Nitro replace touches (declare lines are erased). */
const IDENTIFIER_FRAGMENT = [
  'typeof __EVLOG_CONFIG__ === "undefined"',
  '(__EVLOG_CONFIG__ === null)',
  '(typeof __EVLOG_CONFIG__ !== "object")',
  'void (__EVLOG_CONFIG__)',
].join('\n')

/**
 * Build a JS-only fragment mirroring how Nitro replace touches each file:
 * every block comment plus the identifier guard lines that reference the token.
 */
function toJsReplaceFragment(source: string): string {
  return `${extractBlockComments(source).join('\n')}\n${IDENTIFIER_FRAGMENT}`
}

describe('nitro config inline replace (issue #397)', () => {
  for (const relativePath of NITRO_INLINE_SOURCES) {
    const absolutePath = resolve(import.meta.dirname, relativePath)
    const source = readFileSync(absolutePath, 'utf8')
    const label = relativePath.split('/').pop()!

    it(`${label} has no ${INLINE_REPLACE_TOKEN} inside block comments`, () => {
      for (const comment of extractBlockComments(source)) {
        expect(comment, `block comment in ${label}`).not.toContain(INLINE_REPLACE_TOKEN)
      }
    })

    it(`${label} stays parseable after Nitro replace with star-slash globs`, () => {
      const fragment = toJsReplaceFragment(source)
      const replaced = applyNitroInlineReplace(fragment, {
        env: { service: 'example' },
        exclude: ['/api/graphs/**/changes', '/api/graphs/*/changes'],
      })

      expect(() => parse(replaced, { ecmaVersion: 'latest', sourceType: 'module' })).not.toThrow()
    })
  }
})
