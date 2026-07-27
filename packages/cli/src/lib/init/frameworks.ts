import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Framework } from '../map/types'
import {
  addImport,
  appendProperty,
  appendToArray,
  applySplices,
  arrayMentions,
  findConfigObject,
  getProperty,
  hasImportFrom,
  hasProperty,
  readConfig,
} from './edit'
import type { ArrayNode, ObjectNode, Splice } from './edit'

/**
 * A file `init` will write.
 *
 * Always the full new contents rather than a patch, so `--dry-run` can show the
 * exact bytes and the apply step is a single `writeFile` with nothing left to
 * interpret.
 */
export interface FileAction {
  path: string
  relative: string
  kind: 'create' | 'patch'
  contents: string
}

/** A step `init` will not do for you, with the code to paste and why. */
export interface ManualStep {
  title: string
  file: string
  snippet: string
  reason: string
}

export interface WiringPlan {
  actions: FileAction[]
  manual: ManualStep[]
  /** Wiring that is already in place — printed so the run is never silent. */
  already: string[]
}

export interface WiringInput {
  /** Package root — where configs live and files are written. */
  root: string
  framework: Framework
  service: string
  /** Write a local `.evlog/logs` sink alongside the wiring. */
  sink: boolean
  /** Nitro major, when the framework is Nitro (`tanstack-start` is always v3). */
  nitroMajor: 2 | 3
}

function firstExisting(root: string, names: string[]): string | null {
  for (const name of names) {
    if (existsSync(join(root, name))) return join(root, name)
  }
  return null
}

const CONFIG_EXTENSIONS = ['ts', 'mts', 'js', 'mjs']

function configCandidates(base: string): string[] {
  return CONFIG_EXTENSIONS.map(ext => `${base}.${ext}`)
}

/* ── nuxt ───────────────────────────────────────────────────────────────── */

function nuxtConfigTemplate(service: string): string {
  return `export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: {
    env: { service: '${service}' },
  },
})
`
}

function planNuxt(input: WiringInput): WiringPlan {
  const plan: WiringPlan = { actions: [], manual: [], already: [] }
  const configPath = firstExisting(input.root, configCandidates('nuxt.config'))

  if (!configPath) {
    const path = join(input.root, 'nuxt.config.ts')
    plan.actions.push({ path, relative: 'nuxt.config.ts', kind: 'create', contents: nuxtConfigTemplate(input.service) })
    return withNitroSink(plan, input)
  }

  const relativePath = relative(input.root, configPath)
  const config = readConfig(configPath)
  const object = config ? findConfigObject(config.program) : null

  if (!config || !object) {
    plan.manual.push({
      title: 'Register the Nuxt module',
      file: relativePath,
      snippet: `modules: ['evlog/nuxt'],\nevlog: {\n  env: { service: '${input.service}' },\n},`,
      reason: config ? 'the config does not export a plain object literal' : 'the config could not be parsed',
    })
    return withNitroSink(plan, input)
  }

  const splices: Splice[] = []
  const modules = getProperty(object, 'modules')

  if (modules?.type === 'ArrayExpression') {
    if (arrayMentions(config.source, modules as ArrayNode, 'evlog/nuxt')) plan.already.push(`${relativePath} already registers evlog/nuxt`)
    else splices.push(appendToArray(config.source, modules as ArrayNode, `'evlog/nuxt'`))
  } else if (modules) {
    plan.manual.push({
      title: 'Register the Nuxt module',
      file: relativePath,
      snippet: `'evlog/nuxt'`,
      reason: '`modules` is computed rather than an array literal',
    })
  } else {
    splices.push(appendProperty(config.source, object, `modules: ['evlog/nuxt']`))
  }

  if (hasProperty(object, 'evlog')) plan.already.push(`${relativePath} already has an evlog block`)
  else splices.push(appendProperty(config.source, object, `evlog: {\n    env: { service: '${input.service}' },\n  }`))

  if (splices.length > 0) {
    plan.actions.push({
      path: configPath,
      relative: relativePath,
      kind: 'patch',
      contents: applySplices(config.source, splices),
    })
  }

  return withNitroSink(plan, input)
}

/* ── nitro / tanstack start ─────────────────────────────────────────────── */

function nitroModuleSpecifier(major: 2 | 3): string {
  return major === 3 ? 'evlog/nitro/v3' : 'evlog/nitro'
}

function nitroConfigTemplate(input: WiringInput): string {
  const asyncContext = input.framework === 'tanstack-start'
    ? '  experimental: {\n    asyncContext: true,\n  },\n'
    : ''

  if (input.nitroMajor === 3) {
    return `import { defineConfig } from 'nitro'
import evlog from 'evlog/nitro/v3'

export default defineConfig({
${asyncContext}  modules: [
    evlog({
      env: { service: '${input.service}' },
    }),
  ],
})
`
  }

  return `import { defineNitroConfig } from 'nitropack/config'
import evlog from 'evlog/nitro'

export default defineNitroConfig({
  modules: [
    evlog({
      env: { service: '${input.service}' },
    }),
  ],
})
`
}

function planNitro(input: WiringInput): WiringPlan {
  const plan: WiringPlan = { actions: [], manual: [], already: [] }
  const specifier = nitroModuleSpecifier(input.nitroMajor)
  const configPath = firstExisting(input.root, configCandidates('nitro.config'))

  if (!configPath) {
    const path = join(input.root, 'nitro.config.ts')
    plan.actions.push({ path, relative: 'nitro.config.ts', kind: 'create', contents: nitroConfigTemplate(input) })
    return withTanstackNotes(withNitroSink(plan, input), input)
  }

  const relativePath = relative(input.root, configPath)
  const config = readConfig(configPath)
  const object = config ? findConfigObject(config.program) : null
  const moduleCall = `evlog({\n      env: { service: '${input.service}' },\n    })`

  if (!config || !object) {
    plan.manual.push({
      title: 'Register the Nitro module',
      file: relativePath,
      snippet: `import evlog from '${specifier}'\n\n// inside the config:\nmodules: [\n  ${moduleCall},\n],`,
      reason: config ? 'the config does not export a plain object literal' : 'the config could not be parsed',
    })
    return withTanstackNotes(withNitroSink(plan, input), input)
  }

  const splices: Splice[] = []
  const modules = getProperty(object, 'modules')
  let needsImport = false

  if (modules?.type === 'ArrayExpression') {
    if (arrayMentions(config.source, modules as ArrayNode, 'evlog')) {
      plan.already.push(`${relativePath} already registers the evlog module`)
    } else {
      splices.push(appendToArray(config.source, modules as ArrayNode, moduleCall))
      needsImport = true
    }
  } else if (modules) {
    plan.manual.push({
      title: 'Register the Nitro module',
      file: relativePath,
      snippet: moduleCall,
      reason: '`modules` is computed rather than an array literal',
    })
  } else {
    splices.push(appendProperty(config.source, object, `modules: [\n    ${moduleCall},\n  ]`))
    needsImport = true
  }

  if (needsImport && !hasImportFrom(config.program, specifier)) {
    splices.push(addImport(config.source, config.program, `import evlog from '${specifier}'`))
  }

  if (input.framework === 'tanstack-start') {
    /* `useRequest()` is how TanStack Start route handlers reach the logger, and
       it returns nothing without async context — wiring the module without this
       flag produces an install that looks complete and logs no business
       context. */
    const experimental = getProperty(object, 'experimental')
    if (!experimental) {
      splices.push(appendProperty(config.source, object, `experimental: {\n    asyncContext: true,\n  }`))
    } else if (experimental.type === 'ObjectExpression' && !hasProperty(experimental as ObjectNode, 'asyncContext')) {
      splices.push(appendProperty(config.source, experimental as ObjectNode, 'asyncContext: true'))
    }
  }

  if (splices.length > 0) {
    plan.actions.push({
      path: configPath,
      relative: relativePath,
      kind: 'patch',
      contents: applySplices(config.source, splices),
    })
  }

  return withTanstackNotes(withNitroSink(plan, input), input)
}

/**
 * The one piece of TanStack Start wiring `init` refuses to do.
 *
 * The root route is a component file with its own imports, JSX and options
 * object; splicing a middleware into it is guesswork, and a broken
 * `__root.tsx` costs more than reading four lines and pasting them.
 */
function withTanstackNotes(plan: WiringPlan, input: WiringInput): WiringPlan {
  if (input.framework !== 'tanstack-start') return plan
  const rootRoute = firstExisting(input.root, ['src/routes/__root.tsx', 'app/routes/__root.tsx'])
  plan.manual.push({
    title: 'Return structured errors from the root route',
    file: rootRoute ? relative(input.root, rootRoute) : 'src/routes/__root.tsx',
    snippet: `import { createMiddleware } from '@tanstack/react-start'
import { evlogErrorHandler } from 'evlog/nitro/v3'

export const Route = createRootRoute({
  server: {
    middleware: [createMiddleware().server(evlogErrorHandler)],
  },
})`,
    reason: 'TanStack Start handles errors before Nitro, so createError() needs this middleware to keep why / fix / link',
  })
  return plan
}

function nitroSinkTemplate(): string {
  return `import { createFsDrain } from 'evlog/fs'

/**
 * Local wide-event sink — writes NDJSON to .evlog/logs during development.
 * Swap createFsDrain() for a hosted adapter (Axiom, OTLP, …) in production.
 */
export default defineNitroPlugin((nitroApp) => {
  if (!import.meta.dev) return
  nitroApp.hooks.hook('evlog:drain', createFsDrain())
})
`
}

/**
 * Add the local sink plugin for Nitro-based apps.
 *
 * Guarded by `import.meta.dev` rather than shipped as-is: a drain that writes
 * files is a development convenience, and turning one on in production without
 * being asked is not `init`'s call to make.
 */
function withNitroSink(plan: WiringPlan, input: WiringInput): WiringPlan {
  if (!input.sink) return plan
  const relativePath = join('server', 'plugins', 'evlog-drain.ts')
  const path = join(input.root, relativePath)
  if (existsSync(path)) {
    plan.already.push(`${relativePath} already exists`)
    return plan
  }
  plan.actions.push({ path, relative: relativePath, kind: 'create', contents: nitroSinkTemplate() })
  return plan
}

/* ── next ───────────────────────────────────────────────────────────────── */

function nextInstrumentationTemplate(service: string): string {
  return `import { defineNodeInstrumentation } from 'evlog/next/instrumentation'

export const { register, onRequestError } = defineNodeInstrumentation({
  service: '${service}',
  captureOutput: true,
})
`
}

function nextLibTemplate(service: string, sink: boolean): string {
  const imports = sink
    ? `import { createEvlog } from 'evlog/next'\nimport { createFsDrain } from 'evlog/fs'\n`
    : `import { createEvlog } from 'evlog/next'\n`
  const drain = sink
    ? `\n  // Local NDJSON sink under .evlog/logs — swap for a hosted adapter in production.\n  drain: process.env.NODE_ENV === 'production' ? undefined : createFsDrain(),\n`
    : '\n'

  return `${imports}
export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: '${service}',${drain}})
`
}

function planNext(input: WiringInput): WiringPlan {
  const plan: WiringPlan = { actions: [], manual: [], already: [] }
  /* Next resolves both `instrumentation.ts` and `src/instrumentation.ts`, but
     only the one that matches the app directory — putting it at the root of a
     `src/` project makes a file that is never loaded. */
  const useSrc = existsSync(join(input.root, 'src', 'app')) || existsSync(join(input.root, 'src', 'pages'))
  const base = useSrc ? join(input.root, 'src') : input.root

  const instrumentation = firstExisting(base, configCandidates('instrumentation'))
  if (instrumentation) {
    plan.already.push(`${relative(input.root, instrumentation)} already exists`)
  } else {
    const path = join(base, 'instrumentation.ts')
    plan.actions.push({
      path,
      relative: relative(input.root, path),
      kind: 'create',
      contents: nextInstrumentationTemplate(input.service),
    })
  }

  const lib = firstExisting(base, ['lib/evlog.ts', 'lib/evlog.tsx', 'app/lib/evlog.ts'])
  if (lib) {
    plan.already.push(`${relative(input.root, lib)} already exists`)
  } else {
    const path = join(base, 'lib', 'evlog.ts')
    plan.actions.push({
      path,
      relative: relative(input.root, path),
      kind: 'create',
      contents: nextLibTemplate(input.service, input.sink),
    })
  }

  plan.manual.push({
    title: 'Wrap a route handler',
    file: relative(input.root, join(base, 'app', 'api', '<route>', 'route.ts')),
    snippet: `import { withEvlog, useLogger } from '@/lib/evlog'

export const GET = withEvlog(async () => {
  const log = useLogger()
  log.set({ action: 'hello' })
  return Response.json({ ok: true })
})`,
    reason: 'Next has no ambient request logger — each handler opts in with withEvlog()',
  })

  return plan
}

/** Build the file plan for a framework. Pure: reads the project, writes nothing. */
export function planWiring(input: WiringInput): WiringPlan {
  switch (input.framework) {
    case 'nuxt': return planNuxt(input)
    case 'nitro':
    case 'tanstack-start': return planNitro(input)
    case 'next': return planNext(input)
  }
}
