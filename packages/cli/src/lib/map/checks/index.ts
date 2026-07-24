import { join } from 'node:path'
import type { Node } from 'oxc-parser'
import type { CheckId, CheckResult, RawRouteEntry, RouteKind, ScanContext } from '../types'
import { shouldSkipCheck } from '../exemptions'
import { getImportBindings, isCallNamed, nodeLoc, parseFile, walkAst } from '../parse'
import { lineSnippet } from '../utils'

const HANDLER_KINDS: RouteKind[] = ['api', 'server-action', 'middleware', 'cron']

export type CheckFn = (
  ctx: ScanContext,
  route: RawRouteEntry,
  source: string,
  program: import('oxc-parser').Program,
) => CheckResult

function na(): CheckResult {
  return { status: 'n/a' }
}

function pass(): CheckResult {
  return { status: 'pass' }
}

function fail(message: string, file: string, line: number, snippet?: string): CheckResult {
  return {
    status: 'fail',
    message,
    evidence: { file, line, snippet },
  }
}

function isEvlogImport(bindings: Map<string, string>, name: string): boolean {
  const src = bindings.get(name)
  return src === 'evlog' || (src?.includes('evlog') ?? false)
}

export const checkWideEvent: CheckFn = (ctx, route, _source, program) => {
  if (!HANDLER_KINDS.includes(route.kind)) return na()
  if (!ctx.hasEvlog) {
    return fail('evlog not installed — adopt evlog for wide events', route.file, route.handler?.line ?? 1)
  }

  const bindings = getImportBindings(program)
  let found = false
  let line = route.handler?.line ?? 1

  walkAst(program, (node) => {
    if (found) return
    if (isCallNamed(node, ['useLogger'])) {
      const { callee } = (node as { callee: Node })
      if (callee.type === 'Identifier' && isEvlogImport(bindings, callee.name)) {
        found = true
        line = nodeLoc(node)?.line ?? line
      }
      if (callee.type === 'Identifier' && !bindings.has(callee.name)) {
        found = true
        line = nodeLoc(node)?.line ?? line
      }
    }
  })

  if (found) return pass()
  return fail('no useLogger() — handler is a dark event', route.file, line)
}

export const checkContext: CheckFn = (ctx, route, _source, program) => {
  if (!HANDLER_KINDS.includes(route.kind)) return na()
  if (!ctx.hasEvlog) {
    return fail('no log.set() — adopt evlog for request context', route.file, route.handler?.line ?? 1)
  }

  let found = false
  let line = route.handler?.line ?? 1

  walkAst(program, (node) => {
    if (found) return
    if (isCallNamed(node, ['set']) || callIsLogSet(node)) {
      found = true
      line = nodeLoc(node)?.line ?? line
    }
  })

  if (found) return pass()
  return fail('no log.set() context accumulation', route.file, line)
}

function callIsLogSet(node: Node): boolean {
  if (node.type !== 'CallExpression') return false
  const { callee } = (node as { callee: Node })
  if (callee.type === 'MemberExpression') {
    const obj = (callee as { object: Node }).object
    const prop = (callee as { property: Node }).property
    return obj.type === 'Identifier' && obj.name === 'log' && prop.type === 'Identifier' && prop.name === 'set'
  }
  return false
}

export const checkStructuredErrors: CheckFn = (_ctx, route, source, program) => {
  if (!HANDLER_KINDS.includes(route.kind)) return na()

  const issues: Array<{ message: string, line: number }> = []

  walkAst(program, (node) => {
    if (node.type === 'ThrowStatement') {
      const arg = (node as { argument: Node | null }).argument
      if (!arg) return
      if (arg.type === 'NewExpression') {
        const { callee } = (arg as { callee: Node })
        if (callee.type === 'Identifier' && callee.name === 'Error') {
          issues.push({ message: 'throw new Error() — use createError({ why, fix })', line: nodeLoc(node)?.line ?? 1 })
        }
      }
      if (arg.type === 'CallExpression' && isCallNamed(arg, ['createError'])) {
        const props = getObjectProps(arg)
        const hasWhy = props.has('why')
        const hasFix = props.has('fix')
        const line = nodeLoc(node)?.line ?? 1
        if (!hasWhy && !hasFix) {
          issues.push({ message: 'createError() missing why and fix', line })
        } else if (!hasFix) {
          issues.push({ message: 'createError() has why but missing fix', line })
        } else if (!hasWhy) {
          issues.push({ message: 'createError() has fix but missing why', line })
        }
      }
    }
    if (node.type === 'CallExpression' && isCallNamed(node, ['createError'])) {
      const props = getObjectProps(node)
      const line = nodeLoc(node)?.line ?? 1
      if (!props.has('why') || !props.has('fix')) {
        if (!issues.some(i => i.line === line)) {
          if (!props.has('fix')) {
            issues.push({ message: 'createError() has why but missing fix', line })
          } else {
            issues.push({ message: 'createError() missing why and fix', line })
          }
        }
      }
    }
  })

  if (issues.length === 0) return pass()
  const first = issues[0]!
  return fail(first.message, route.file, first.line, lineSnippet(source, first.line))
}

function getObjectProps(callNode: Node): Set<string> {
  const props = new Set<string>()
  if (callNode.type !== 'CallExpression') return props
  const { arguments: args } = (callNode as { arguments: Node[] })
  const [first] = args
  if (!first || first.type !== 'ObjectExpression') return props
  for (const prop of (first as { properties: Node[] }).properties) {
    if (prop.type === 'Property') {
      const { key } = (prop as { key: Node })
      if (key.type === 'Identifier') props.add(key.name)
      if (key.type === 'Literal') props.add(String((key as { value: unknown }).value))
    }
  }
  return props
}

export const checkAudit: CheckFn = (_ctx, route) => {
  if (!HANDLER_KINDS.includes(route.kind)) return na()
  return na()
}

export function checkAuditWithSensitivity(
  ctx: ScanContext,
  route: RawRouteEntry,
  program: import('oxc-parser').Program,
  sensitivityLevel: 'high' | 'medium' | 'none',
): CheckResult {
  if (!HANDLER_KINDS.includes(route.kind)) return na()
  if (sensitivityLevel !== 'high') return na()
  if (!ctx.hasEvlog) {
    return fail('sensitive route without log.audit()', route.file, route.handler?.line ?? 1)
  }

  let found = false
  walkAst(program, (node) => {
    if (isCallNamed(node, ['audit']) || callIsLogAudit(node)) found = true
  })

  if (found) return pass()
  return fail('has logger + context but no log.audit() — sensitive route needs audit trail', route.file, route.handler?.line ?? 1)
}

function callIsLogAudit(node: Node): boolean {
  if (node.type !== 'CallExpression') return false
  const { callee } = (node as { callee: Node })
  if (callee.type === 'MemberExpression') {
    const obj = (callee as { object: Node }).object
    const prop = (callee as { property: Node }).property
    return obj.type === 'Identifier' && obj.name === 'log' && prop.type === 'Identifier' && prop.name === 'audit'
  }
  return false
}

export const checkErrorHandling: CheckFn = (_ctx, route, source, program) => {
  if (!HANDLER_KINDS.includes(route.kind)) return na()

  const issues: Array<{ line: number, message: string }> = []

  walkAst(program, (node) => {
    if (node.type !== 'CatchClause') return
    const { body } = (node as { body: { body: Node[] } }).body
    if (body.length === 0) {
      issues.push({ line: nodeLoc(node)?.line ?? 1, message: 'empty catch block swallows errors' })
      return
    }
    const rethrows = body.some((stmt) => {
      if (stmt.type === 'ThrowStatement') return true
      if (stmt.type === 'ExpressionStatement') {
        const expr = (stmt as { expression: Node }).expression
        if (expr.type === 'CallExpression') {
          const name = (expr as { callee: Node }).callee
          if (name.type === 'Identifier' && ['console', 'log'].includes(name.name)) return true
          if (name.type === 'MemberExpression') {
            const prop = (name as { property: Node }).property
            if (prop.type === 'Identifier' && ['error', 'warn', 'set', 'audit'].includes(prop.name)) return true
          }
        }
      }
      if (stmt.type === 'ReturnStatement') return true
      return false
    })
    if (!rethrows) {
      issues.push({ line: nodeLoc(node)?.line ?? 1, message: 'catch block swallows error without logging or rethrow' })
    }
  })

  if (issues.length === 0) return pass()
  const first = issues[0]!
  return fail(first.message, route.file, first.line, lineSnippet(source, first.line))
}

export const checkPageErrorHandling: CheckFn = (_ctx, route, source, program) => {
  if (route.kind !== 'page') return na()

  const hasFetch = /useFetch|\$fetch|fetch\s*\(/.test(source)
  if (!hasFetch) return na()

  let hasErrorHandling = false
  walkAst(program, (node) => {
    if (node.type === 'CatchClause') hasErrorHandling = true
    if (isCallNamed(node, ['onError', 'catchError'])) hasErrorHandling = true
    if (node.type === 'MemberExpression') {
      const prop = (node as { property: Node }).property
      if (prop.type === 'Identifier' && prop.name === 'catch') hasErrorHandling = true
    }
  })

  if (/\.catch\s*\(/.test(source)) hasErrorHandling = true
  if (/error\s*[:=]/.test(source) && /useFetch|useAsyncData/.test(source)) hasErrorHandling = true

  if (hasErrorHandling) return pass()
  return fail('page data fetch without error handling', route.file, 1)
}

export const CHECKS: Record<CheckId, CheckFn> = {
  'wide-event': checkWideEvent,
  'context': checkContext,
  'structured-errors': checkStructuredErrors,
  'audit': checkAudit,
  'error-handling': checkErrorHandling,
  'page-error-handling': checkPageErrorHandling,
}

/** Run every relevant observability check for one route (respecting exemptions). */
export function runChecks(
  ctx: ScanContext,
  route: RawRouteEntry,
  sensitivityLevel: 'high' | 'medium' | 'none',
): Partial<Record<CheckId, CheckResult>> {
  const filePath = join(ctx.projectRoot, route.file)
  const parsed = parseFile(filePath)
  const results: Partial<Record<CheckId, CheckResult>> = {}

  if (!parsed) {
    for (const id of Object.keys(CHECKS) as CheckId[]) {
      if (route.kind === 'page' && id !== 'page-error-handling') continue
      if (route.kind !== 'page' && id === 'page-error-handling') continue
      if (!HANDLER_KINDS.includes(route.kind) && id !== 'page-error-handling') continue
      results[id] = fail('file failed to parse', route.file, 1)
    }
    return results
  }

  if (parsed.errors.length > 0 && ctx.verbose) {
    console.warn(`Parse warnings in ${route.file}: ${parsed.errors.join(', ')}`)
  }

  for (const [id, fn] of Object.entries(CHECKS) as [CheckId, CheckFn][]) {
    if (route.kind === 'page') {
      if (id !== 'page-error-handling') continue
    } else {
      if (id === 'page-error-handling') continue
      if (!HANDLER_KINDS.includes(route.kind)) continue
    }

    const skip = shouldSkipCheck(route, id)
    if (skip) {
      results[id] = { status: 'n/a', message: skip.reason }
      continue
    }

    results[id] = id === 'audit'
      ? checkAuditWithSensitivity(ctx, route, parsed.program, sensitivityLevel)
      : fn(ctx, route, parsed.source, parsed.program)
  }

  return results
}
