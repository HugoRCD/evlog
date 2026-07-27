import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Framework } from '../map/types'
import { findDestination } from './catalog'
import type { DrainId, ExtraId } from './catalog'
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
  /** Where wide events are sent. `none` writes no drain at all. */
  drain: DrainId
  /** Opt-in additions layered onto the drain and the config. */
  extras: ExtraId[]
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

function nuxtConfigTemplate(input: WiringInput): string {
  const sampling = samplingProperty(input)
  return `export default defineNuxtConfig({
  modules: ['evlog/nuxt'],
  evlog: {
    env: { service: '${input.service}' },${sampling ? `\n    ${sampling},` : ''}
  },
})
`
}

function planNuxt(input: WiringInput): WiringPlan {
  const plan: WiringPlan = { actions: [], manual: [], already: [] }
  const configPath = firstExisting(input.root, configCandidates('nuxt.config'))

  if (!configPath) {
    const path = join(input.root, 'nuxt.config.ts')
    plan.actions.push({ path, relative: 'nuxt.config.ts', kind: 'create', contents: nuxtConfigTemplate(input) })
    return withNitroPlugins(plan, input)
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
    return withNitroPlugins(plan, input)
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

  if (hasProperty(object, 'evlog')) {
    plan.already.push(`${relativePath} already has an evlog block`)
    if (samplingProperty(input)) {
      plan.manual.push({
        title: 'Add sampling to the evlog block',
        file: relativePath,
        snippet: `${samplingProperty(input)},`,
        reason: 'the block already exists — merging into options you wrote is not something init guesses at',
      })
    }
  } else {
    const sampling = samplingProperty(input)
    splices.push(appendProperty(
      config.source,
      object,
      `evlog: {\n    env: { service: '${input.service}' },${sampling ? `\n    ${sampling},` : ''}\n  }`,
    ))
  }

  if (splices.length > 0) {
    plan.actions.push({
      path: configPath,
      relative: relativePath,
      kind: 'patch',
      contents: applySplices(config.source, splices),
    })
  }

  return withNitroPlugins(plan, input)
}

/* ── nitro / tanstack start ─────────────────────────────────────────────── */

function nitroModuleSpecifier(major: 2 | 3): string {
  return major === 3 ? 'evlog/nitro/v3' : 'evlog/nitro'
}

function nitroConfigTemplate(input: WiringInput): string {
  const sampling = samplingProperty(input)
  const asyncContext = input.framework === 'tanstack-start'
    ? '  experimental: {\n    asyncContext: true,\n  },\n'
    : ''

  if (input.nitroMajor === 3) {
    return `import { defineConfig } from 'nitro'
import evlog from 'evlog/nitro/v3'

export default defineConfig({
${asyncContext}  modules: [
    evlog({
      env: { service: '${input.service}' },${sampling ? `\n      ${sampling},` : ''}
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
      env: { service: '${input.service}' },${sampling ? `\n      ${sampling},` : ''}
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
    return withTanstackNotes(withNitroPlugins(plan, input), input)
  }

  const relativePath = relative(input.root, configPath)
  const config = readConfig(configPath)
  const object = config ? findConfigObject(config.program) : null
  const sampling = samplingProperty(input)
  const moduleCall = `evlog({\n      env: { service: '${input.service}' },${sampling ? `\n      ${sampling},` : ''}\n    })`

  if (!config || !object) {
    plan.manual.push({
      title: 'Register the Nitro module',
      file: relativePath,
      snippet: `import evlog from '${specifier}'\n\n// inside the config:\nmodules: [\n  ${moduleCall},\n],`,
      reason: config ? 'the config does not export a plain object literal' : 'the config could not be parsed',
    })
    return withTanstackNotes(withNitroPlugins(plan, input), input)
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

  return withTanstackNotes(withNitroPlugins(plan, input), input)
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

  if (input.extras.includes('vite')) {
    /* `vite.config.ts` already holds the TanStack and Nitro plugins in an array
       whose shape varies per template, and the plugin has to sit alongside them
       in the right order. Cheaper to read four lines than to guess. */
    const viteConfig = firstExisting(input.root, configCandidates('vite.config'))
    plan.manual.push({
      title: 'Add the evlog Vite plugin',
      file: viteConfig ? relative(input.root, viteConfig) : 'vite.config.ts',
      snippet: `import evlog from 'evlog/vite'

export default defineConfig({
  plugins: [
    evlog(),
    // …your existing plugins
  ],
})`,
      reason: 'strips log.debug() from production builds and injects source locations',
    })
  }

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

/**
 * The Nitro drain plugin for the chosen destination.
 *
 * A development-only drain is gated on `import.meta.dev`; a hosted one is not.
 * The filesystem adapter writes files on whatever box serves the request, so
 * leaving it on in production is a decision, and `init` does not make it for
 * you. Everything else is production traffic by definition.
 */
function nitroDrainTemplate(input: WiringInput): string | null {
  const destination = findDestination(input.drain)
  if (!destination?.specifier || !destination.factory) return null

  const batched = input.extras.includes('pipeline')
  const imports = [`import { ${destination.factory.replace('()', '')} } from '${destination.specifier}'`]
  if (batched) {
    imports.unshift(`import type { DrainContext } from 'evlog'`)
    imports.push(`import { createDrainPipeline } from 'evlog/pipeline'`)
  }

  const setup = batched
    ? `const pipeline = createDrainPipeline<DrainContext>({
  batch: { size: 50, intervalMs: 5000 },
  retry: { maxAttempts: 3 },
})
const drain = pipeline(${destination.factory})`
    : `const drain = ${destination.factory}`

  const guard = destination.productionSafe
    ? ''
    : '  // Local files are a development convenience — never a production sink.\n  if (!import.meta.dev) return\n'

  const envNote = destination.env.length > 0
    ? `\n * Reads ${destination.env.map(variable => variable.name).join(' and ')} from the environment.`
    : ''

  return `${imports.join('\n')}

/**
 * Wide events land in ${destination.label}.${envNote}
 */
${setup}

export default defineNitroPlugin((nitroApp) => {
${guard}  nitroApp.hooks.hook('evlog:drain', drain)
})
`
}

function nitroEnricherTemplate(): string {
  return `import {
  createGeoEnricher,
  createRequestSizeEnricher,
  createTraceContextEnricher,
  createUserAgentEnricher,
} from 'evlog/enrichers'

const enrichers = [
  createUserAgentEnricher(),
  createGeoEnricher(),
  createRequestSizeEnricher(),
  createTraceContextEnricher(),
]

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:enrich', async (ctx) => {
    for (const enrich of enrichers) await enrich(ctx)
  })
})
`
}

/** Add the Nitro-side plugins: the drain, and the enrichers when asked for. */
function withNitroPlugins(plan: WiringPlan, input: WiringInput): WiringPlan {
  const files: { relative: string, contents: string | null }[] = [
    { relative: join('server', 'plugins', 'evlog-drain.ts'), contents: nitroDrainTemplate(input) },
    {
      relative: join('server', 'plugins', 'evlog-enrich.ts'),
      contents: input.extras.includes('enrichers') ? nitroEnricherTemplate() : null,
    },
  ]

  for (const file of files) {
    if (file.contents === null) continue
    const path = join(input.root, file.relative)
    if (existsSync(path)) {
      plan.already.push(`${file.relative} already exists`)
      continue
    }
    plan.actions.push({ path, relative: file.relative, kind: 'create', contents: file.contents })
  }

  return plan
}

/** The `sampling` block for a module config, when the extra was selected. */
function samplingProperty(input: WiringInput): string | null {
  if (!input.extras.includes('sampling')) return null
  /* Errors are never sampled out. A sampling config that drops errors is one
     that hides the only events anybody reads at 3am. */
  return `sampling: {
      rates: { info: 25, warn: 100, error: 100, debug: 5 },
    }`
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

function nextLibTemplate(input: WiringInput): string {
  const destination = findDestination(input.drain)
  const wired = destination?.specifier && destination.factory ? destination : null

  const imports = [`import { createEvlog } from 'evlog/next'`]
  if (wired) imports.push(`import { ${wired.factory!.replace('()', '')} } from '${wired.specifier}'`)

  const batched = wired && input.extras.includes('pipeline')
  if (batched) {
    imports.splice(1, 0, `import type { DrainContext } from 'evlog'`)
    imports.push(`import { createDrainPipeline } from 'evlog/pipeline'`)
  }

  const pipeline = batched
    ? `\nconst pipeline = createDrainPipeline<DrainContext>({\n  batch: { size: 50, intervalMs: 5000 },\n  retry: { maxAttempts: 3 },\n})\n`
    : ''

  const expression = wired
    ? (batched ? `pipeline(${wired.factory})` : wired.factory!)
    : null

  /* The filesystem drain writes files on whatever box serves the request, so
     it is scoped to development here the same way the Nitro plugin scopes it. */
  const drain = expression === null
    ? '\n'
    : wired!.productionSafe
      ? `\n  drain: ${expression},\n`
      : `\n  // Local NDJSON under .evlog/logs — development only.\n  drain: process.env.NODE_ENV === 'production' ? undefined : ${expression},\n`

  return `${imports.join('\n')}
${pipeline}
export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: '${input.service}',${drain}})
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
      contents: nextLibTemplate(input),
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
