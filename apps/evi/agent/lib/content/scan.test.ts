import { describe, expect, it } from 'vitest'
import { PASSAGE_FILE, scanCommand, shellQuote } from './scan'

describe('shellQuote', () => {
  it('survives the characters that end an argument', () => {
    expect(shellQuote('a\'b')).toBe(`'a'\\''b'`)
    expect(shellQuote('a; rm -rf /')).toBe(`'a; rm -rf /'`)
    expect(shellQuote('$(whoami)')).toBe(`'$(whoami)'`)
  })
})

describe('scanCommand', () => {
  it('scans a file in the checkout at the surface it lives on', () => {
    const { command, passage } = scanCommand({ path: 'apps/docs/content/2.learn/a.md', as: 'blog' })

    expect(command).toContain(`'apps/docs/content/2.learn/a.md' --json`)
    expect(command).not.toContain('--as')
    expect(passage).toBeUndefined()
  })

  it('carries the surface for input that lives nowhere', () => {
    expect(scanCommand({ url: 'https://getpino.io/', as: 'reference' }).command)
      .toContain(`--url 'https://getpino.io/' --as 'reference' --json`)
    expect(scanCommand({ text: 'A draft.' }).command).toContain(`--as 'docs'`)
  })

  it('stages a passage in a file rather than in the command', () => {
    const { command, passage } = scanCommand({ text: 'It\'s `powerful` $(and) \'quoted\'.' })

    expect(passage).toBe('It\'s `powerful` $(and) \'quoted\'.')
    expect(command).toContain(`--stdin --as 'docs' --json < ${PASSAGE_FILE}`)
    expect(command).not.toContain('powerful')
  })
})
