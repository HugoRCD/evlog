import { readFileSync } from 'node:fs'
import { parseSync } from 'oxc-parser'
import type { Node, Program } from 'oxc-parser'

export interface ParseResult {
  program: Program
  source: string
  errors: string[]
}

/** Parse a route file (Vue `<script>` extracted first) into an oxc AST + source. */
export function parseFile(filePath: string): ParseResult | null {
  let source: string
  try {
    source = readFileSync(filePath, 'utf8')
  } catch {
    return null
  }

  const ext = filePath.split('.').pop()?.toLowerCase()
  let code = source

  if (ext === 'vue') {
    const extracted = extractVueScript(source)
    if (!extracted) return null
    code = extracted
  }

  const result = parseSync(filePath, code, {
    sourceType: 'module',
    lang: ext === 'tsx' || ext === 'jsx' ? 'tsx' : 'ts',
  })

  if (result.errors.length > 0) {
    return {
      program: result.program,
      source: code,
      errors: result.errors.map(e => e.message),
    }
  }

  return { program: result.program, source: code, errors: [] }
}

function extractVueScript(source: string): string | null {
  const scriptSetup = source.match(/<script[^>]*setup[^>]*>([\s\S]*?)<\/script>/i)
  if (scriptSetup?.[1]) return scriptSetup[1]
  const script = source.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
  return script?.[1] ?? null
}

export type VisitorFn = (node: Node, parent: Node | null) => void

/** Walk every node in an oxc AST subtree, depth-first. */
export function walkAst(node: Node, visitor: VisitorFn, parent: Node | null = null): void {
  visitor(node, parent)
  for (const key of Object.keys(node as unknown as Record<string, unknown>)) {
    const value = (node as unknown as Record<string, unknown>)[key]
    if (!value) continue
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) {
          walkAst(child as Node, visitor, node)
        }
      }
    } else if (typeof value === 'object' && value !== null && 'type' in value) {
      walkAst(value as Node, visitor, node)
    }
  }
}

export function nodeLoc(node: Node, source?: string): { line: number, column: number } | null {
  if ('start' in node && typeof node.start === 'number') {
    if (source) {
      return { line: offsetToLine(source, node.start), column: 0 }
    }
    return { line: 1, column: node.start }
  }
  if ('loc' in node && node.loc && typeof node.loc === 'object') {
    const loc = node.loc as { start?: { line?: number, column?: number } }
    if (loc.start?.line !== undefined) {
      return { line: loc.start.line, column: loc.start.column ?? 0 }
    }
  }
  return null
}

export function isCallNamed(node: Node, names: string[]): node is Node & { type: 'CallExpression', callee: Node } {
  if (node.type !== 'CallExpression') return false
  const { callee } = (node as { callee: Node })
  if (callee.type === 'Identifier') {
    return names.includes(callee.name)
  }
  if (callee.type === 'MemberExpression') {
    const prop = (callee as { property: Node }).property
    if (prop.type === 'Identifier') {
      return names.includes(prop.name)
    }
  }
  return false
}

export function callName(node: Node): string | null {
  if (node.type !== 'CallExpression') return null
  const { callee } = (node as { callee: Node })
  if (callee.type === 'Identifier') return callee.name
  if (callee.type === 'MemberExpression') {
    const obj = (callee as { object: Node }).object
    const prop = (callee as { property: Node }).property
    if (obj.type === 'Identifier' && prop.type === 'Identifier') {
      return `${obj.name}.${prop.name}`
    }
  }
  return null
}

export function isImportFrom(node: Node, sources: string[]): boolean {
  if (node.type !== 'ImportDeclaration') return false
  const source = (node as { source: { value: string } }).source.value
  return sources.some(s => source === s || source.startsWith(`${s}/`))
}

/** Map local identifier -> import source, for every import in a program. */
export function getImportBindings(program: Program): Map<string, string> {
  const bindings = new Map<string, string>()
  walkAst(program, (node) => {
    if (node.type !== 'ImportDeclaration') return
    const decl = node as {
      source: { value: string }
      specifiers: Array<{ type: string, local?: { name: string }, imported?: { name: string } }>
    }
    for (const spec of decl.specifiers) {
      if (spec.type === 'ImportDefaultSpecifier' && spec.local) {
        bindings.set(spec.local.name, decl.source.value)
      }
      if (spec.type === 'ImportSpecifier' && spec.local) {
        bindings.set(spec.local.name, decl.source.value)
      }
      if (spec.type === 'ImportNamespaceSpecifier' && spec.local) {
        bindings.set(spec.local.name, decl.source.value)
      }
    }
  })
  return bindings
}

export function offsetToLine(source: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++
  }
  return line
}

export function findHandlerLocation(program: Program, source: string, patterns: string[]): { line: number, column: number } | null {
  let found: { line: number, column: number } | null = null
  walkAst(program, (node) => {
    if (found) return
    if (isCallNamed(node, patterns)) {
      const loc = nodeLoc(node, source)
      if (loc) {
        found = loc
      }
    }
    if (node.type === 'ExportDefaultDeclaration') {
      const loc = nodeLoc(node, source)
      if (loc) found = loc
    }
  })
  return found
}

export function hasDirective(program: Program, directive: string): boolean {
  let found = false
  walkAst(program, (node) => {
    if (node.type === 'ExpressionStatement') {
      const expr = (node as { expression: Node }).expression
      if (expr.type === 'Literal' && (expr as { value: unknown }).value === directive) {
        found = true
      }
    }
  })
  return found
}

export function findHttpMethodExports(program: Program): Array<{ method: string, line: number }> {
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
  const found: Array<{ method: string, line: number }> = []
  walkAst(program, (node) => {
    if (node.type === 'ExportNamedDeclaration') {
      const decl = node as { declaration?: Node, specifiers?: Array<{ exported: Node }> }
      if (decl.declaration?.type === 'FunctionDeclaration') {
        const fn = decl.declaration as { id?: { name: string } }
        if (fn.id?.name && methods.includes(fn.id.name)) {
          const loc = nodeLoc(node)
          found.push({ method: fn.id.name, line: loc?.line ?? 1 })
        }
      }
      if (decl.declaration?.type === 'VariableDeclaration') {
        const varDecl = decl.declaration as { declarations: Array<{ id: Node, init?: Node }> }
        for (const d of varDecl.declarations) {
          if (d.id.type === 'Identifier' && methods.includes(d.id.name) && d.init) {
            const loc = nodeLoc(d.init)
            found.push({ method: d.id.name, line: loc?.line ?? 1 })
          }
        }
      }
    }
  })
  return found
}
