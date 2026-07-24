import type { Node } from 'oxc-parser'
import { globSync } from 'tinyglobby'
import {
  findHandlerLocation,
  findHttpMethodExports,
  hasDirective,
  nodeLoc,
  parseFile,
  walkAst,
} from '../parse'
import type { FrameworkAdapter, RawRouteEntry, ScanContext } from '../types'
import { relativeFromRoot, segmentsToPath } from '../utils'

function resolveAppDir(root: string): string {
  if (globSync('app/**/page.{tsx,jsx,ts,js}', { cwd: root }).length > 0) {
    return 'app'
  }
  if (globSync('src/app/**/page.{tsx,jsx,ts,js}', { cwd: root }).length > 0) {
    return 'src/app'
  }
  return 'app'
}

function routeDirFromFile(rel: string, appDir: string): string {
  const inner = rel.slice(`${appDir}/`.length)
  return inner.replace(/\/route\.(tsx?|jsx?)$/, '')
}

/** Next.js App Router: `route.ts` handlers, `page.tsx`, middleware, `"use server"` actions. */
export const nextAdapter: FrameworkAdapter = {
  framework: 'next',
  // eslint-disable-next-line require-await -- satisfies the async FrameworkAdapter contract
  async extractRoutes(ctx: ScanContext): Promise<RawRouteEntry[]> {
    const routes: RawRouteEntry[] = []
    const root = ctx.projectRoot
    const appDir = resolveAppDir(root)

    for (const file of globSync(`${appDir}/**/route.{ts,js,tsx,jsx}`, { cwd: root, absolute: true })) {
      const rel = relativeFromRoot(root, file)
      const dir = routeDirFromFile(rel, appDir)
      const apiPath = segmentsToPath(dir.split('/')) || '/'

      const parsed = parseFile(file)
      if (!parsed) {
        routes.push({
          framework: 'next',
          kind: 'api',
          method: null,
          path: apiPath,
          file: rel,
          handler: null,
        })
        continue
      }

      const methods = findHttpMethodExports(parsed.program)
      if (methods.length === 0) {
        routes.push({
          framework: 'next',
          kind: 'api',
          method: null,
          path: apiPath,
          file: rel,
          handler: findHandlerLocation(parsed.program, parsed.source, []),
        })
      } else {
        for (const { method, line } of methods) {
          routes.push({
            framework: 'next',
            kind: 'api',
            method,
            path: apiPath,
            file: rel,
            handler: { line, column: 0 },
          })
        }
      }
    }

    for (const file of globSync(`${appDir}/**/page.{tsx,jsx,ts,js}`, { cwd: root, absolute: true })) {
      const rel = relativeFromRoot(root, file)
      const inner = rel.slice(`${appDir}/`.length)
      const dir = inner.replace(/^(.*\/)?page\.(tsx?|jsx?)$/, (_m, parent) => parent ?? '')
      const path = segmentsToPath(dir ? dir.split('/') : []) || '/'
      routes.push({
        framework: 'next',
        kind: 'page',
        method: null,
        path,
        file: rel,
        handler: null,
      })
    }

    for (const file of globSync(['middleware.{ts,js}', 'src/middleware.{ts,js}'], { cwd: root, absolute: true })) {
      const rel = relativeFromRoot(root, file)
      const parsed = parseFile(file)
      routes.push({
        framework: 'next',
        kind: 'middleware',
        method: null,
        path: '*',
        file: rel,
        handler: parsed
          ? findHandlerLocation(parsed.program, parsed.source, [])
          : null,
      })
    }

    for (const file of globSync([`${appDir}/**/*.{ts,tsx,js,jsx}`, 'src/**/*.{ts,tsx,js,jsx}'], { cwd: root, absolute: true })) {
      const parsed = parseFile(file)
      if (!parsed || !hasDirective(parsed.program, 'use server')) continue
      const rel = relativeFromRoot(root, file)
      const exports = findServerActionExports(parsed.program)
      for (const exp of exports) {
        routes.push({
          framework: 'next',
          kind: 'server-action',
          method: 'POST',
          path: `action:${exp.name}`,
          file: rel,
          handler: { line: exp.line, column: 0 },
        })
      }
    }

    return routes
  },
}

function findServerActionExports(program: import('oxc-parser').Program): Array<{ name: string, line: number }> {
  const exports: Array<{ name: string, line: number }> = []
  walkAst(program, (node) => {
    if (node.type === 'ExportNamedDeclaration') {
      const decl = node as {
        declaration?: {
          type: string
          id?: { name: string }
          declarations?: Array<{ id: { type: string, name: string }, init?: { type: string } }>
        }
      }
      if (decl.declaration?.type === 'FunctionDeclaration' && decl.declaration.id?.name) {
        const loc = nodeLoc(node)
        exports.push({ name: decl.declaration.id.name, line: loc?.line ?? 1 })
      }
      if (decl.declaration?.type === 'VariableDeclaration') {
        for (const d of decl.declaration.declarations ?? []) {
          if (d.id.type === 'Identifier' && d.init && (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression')) {
            const loc = nodeLoc(d.init as Node)
            exports.push({ name: d.id.name, line: loc?.line ?? 1 })
          }
        }
      }
    }
  })
  return exports
}
