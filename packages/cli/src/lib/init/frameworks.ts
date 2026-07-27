import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Framework } from '../map/types'
import { findDestination, findEnricher, findSamplingPreset } from './catalog'
import type { DrainId, EnricherId, ExtraId, SamplingProfile } from './catalog'
import { auditActionName } from './insight'
import type { AuditGap, RepeatedErrorSeed } from './insight'
import {
  addImport,
  appendProperty,
  appendToArray,
  applySplices,
  arrayMentions,
  findConfigObject,
  findCreateEvlogCall,
  getProperty,
  importsEnd,
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
  /** Local sink: `fs` or `none`. */
  devDrain: DrainId
  /** Where production events go. Empty means nothing leaves the process. */
  prodDrains: DrainId[]
  /** Opt-in additions layered onto the drain and the config. */
  extras: ExtraId[]
  /** Which enrichers to wire, when the `enrichers` extra was selected. */
  enrichers: EnricherId[]
  /** Sampling preset, when the `sampling` extra was selected. */
  sampling: SamplingProfile
  /** Nitro major, when the framework is Nitro (`tanstack-start` is always v3). */
  nitroMajor: 2 | 3
  /** Seeds from the scan, when the catalog extras were selected. */
  repeatedErrors: readonly RepeatedErrorSeed[]
  auditGaps: readonly AuditGap[]
}

/** Every destination this run wires, dev and prod alike. */
function allDrains(input: WiringInput): DrainId[] {
  return [...new Set([input.devDrain, ...input.prodDrains])].filter(id => id !== 'none')
}

/**
 * Whether a file already calls every drain factory this run would wire.
 *
 * Textual on purpose: the question is "would writing this add anything", and a
 * file that mentions `createAxiomDrain` sends events to Axiom however it is
 * spelled around the call.
 */
function wiresEveryDrain(path: string, input: WiringInput): boolean {
  let source: string
  try {
    source = readFileSync(path, 'utf8')
  } catch {
    return false
  }

  return allDrains(input).every((id) => {
    const factory = findDestination(id)?.factory
    return factory ? source.includes(factory.replace('()', '')) : true
  })
}

function describeDrains(input: WiringInput): string {
  const labels = allDrains(input).map(id => findDestination(id)?.label ?? id)
  return labels.length > 0 ? labels.join(' and ') : 'the console'
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
    /* An existing block is not a reason to hand back a snippet: adding a key
       that is not there is the same offset splice as adding one to the root,
       and only a key that already exists is genuinely ambiguous. */
    const sampling = samplingProperty(input)
    const block = getProperty(object, 'evlog')
    if (sampling && block?.type === 'ObjectExpression') {
      if (hasProperty(block as ObjectNode, 'sampling')) {
        plan.manual.push({
          title: 'Reconcile the sampling rates',
          file: relativePath,
          snippet: `${sampling},`,
          reason: 'the evlog block already sets sampling — replacing rates you chose is not init\'s call',
        })
      } else {
        splices.push(appendProperty(config.source, block as ObjectNode, sampling))
      }
    } else if (sampling) {
      plan.manual.push({
        title: 'Add sampling to the evlog block',
        file: relativePath,
        snippet: `${sampling},`,
        reason: 'the evlog block is not a plain object literal',
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
  const dev = input.devDrain === 'none' ? null : findDestination(input.devDrain) ?? null
  const prod = input.prodDrains.map(id => findDestination(id)).filter(Boolean) as NonNullable<ReturnType<typeof findDestination>>[]
  if (!dev && prod.length === 0) return null

  const batched = input.extras.includes('pipeline') && prod.length > 0
  const imports: string[] = []
  if (batched) imports.push(`import type { DrainContext } from 'evlog'`)
  for (const destination of [...(dev ? [dev] : []), ...prod]) {
    imports.push(`import { ${destination.factory!.replace('()', '')} } from '${destination.specifier}'`)
  }
  if (batched) imports.push(`import { createDrainPipeline } from 'evlog/pipeline'`)

  const body: string[] = []
  if (batched) {
    body.push(`const pipeline = createDrainPipeline<DrainContext>({
  batch: { size: 50, intervalMs: 5000 },
  retry: { maxAttempts: 3 },
})
`)
  }

  /* Batching wraps the network sends only. Buffering a local file write adds
     latency to the one loop where you want the event on screen immediately. */
  const wrap = (factory: string) => batched ? `pipeline(${factory})` : factory
  const prodList = prod.map(destination => wrap(destination.factory!)).join(', ')

  /* One plugin, branched on the environment, rather than a file per
     destination: the reader gets the whole delivery story in one place, and
     "which drain runs where" stops being something to reconstruct. */
  if (dev && prod.length > 0) {
    body.push(`/**
 * Development writes to ${dev.label}; production sends to ${prod.map(d => d.label).join(' and ')}.
${envComment(prod)} */
const drains = import.meta.dev
  ? [${dev.factory}]
  : [${prodList}]

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', async (ctx) => {
    await Promise.all(drains.map(drain => drain(ctx)))
  })
})
`)
  } else if (prod.length > 0) {
    body.push(`/**
 * Wide events land in ${prod.map(d => d.label).join(' and ')}.
${envComment(prod)} */
const drains = [${prodList}]

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:drain', async (ctx) => {
    await Promise.all(drains.map(drain => drain(ctx)))
  })
})
`)
  } else {
    body.push(`/**
 * Local wide-event sink — NDJSON under .evlog/logs.
 */
const drain = ${dev!.factory}

export default defineNitroPlugin((nitroApp) => {
  // Local files are a development convenience — never a production sink.
  if (!import.meta.dev) return
  nitroApp.hooks.hook('evlog:drain', drain)
})
`)
  }

  return `${imports.join('\n')}\n\n${body.join('\n')}`
}

function envComment(destinations: { env: { name: string }[] }[]): string {
  const names = [...new Set(destinations.flatMap(d => d.env.map(v => v.name)))]
  return names.length > 0 ? ` * Reads ${names.join(', ')} from the environment.\n` : ''
}

function nitroEnricherTemplate(input: WiringInput): string {
  const chosen = input.enrichers.map(id => findEnricher(id)).filter(Boolean)
  const factories = chosen.map(enricher => enricher!.factory)
  const names = [...factories].map(factory => factory.replace('()', '')).sort()

  return `import {
${names.map(name => `  ${name},`).join('\n')}
} from 'evlog/enrichers'

const enrichers = [
${factories.map(factory => `  ${factory},`).join('\n')}
]

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('evlog:enrich', async (ctx) => {
    for (const enrich of enrichers) await enrich(ctx)
  })
})
`
}

/**
 * Add the Nitro-side plugins.
 *
 * A drain file that already exists is never rewritten — but saying only "it
 * already exists" would leave someone who just picked Axiom with no Axiom
 * anywhere and no idea why. The destination is written beside it under a name
 * of its own, and the existing file is left exactly as it was.
 */
function withNitroPlugins(plan: WiringPlan, input: WiringInput): WiringPlan {
  const drain = nitroDrainTemplate(input)
  if (drain) {
    const preferred = join('server', 'plugins', 'evlog-drain.ts')
    const path = join(input.root, preferred)

    if (!existsSync(path)) {
      plan.actions.push({ path, relative: preferred, kind: 'create', contents: drain })
    } else if (wiresEveryDrain(path, input)) {
      /* Including the file this command wrote last time: without this check,
         running init twice appends a second plugin that drains the same events
         to the same place, and idempotence is the property that makes the
         command safe to re-run at all. */
      plan.already.push(`${preferred} already wires ${describeDrains(input)}`)
    } else {
      const suffix = allDrains(input).join('-') || 'extra'
      const alternate = join('server', 'plugins', `evlog-drain-${suffix}.ts`)
      const alternatePath = join(input.root, alternate)
      if (existsSync(alternatePath)) {
        plan.already.push(`${alternate} already exists`)
      } else {
        plan.actions.push({ path: alternatePath, relative: alternate, kind: 'create', contents: drain })
        plan.already.push(`${preferred} left as it is — the new drain went to ${alternate}`)
      }
    }
  }

  if (input.extras.includes('enrichers') && input.enrichers.length > 0) {
    const relativePath = join('server', 'plugins', 'evlog-enrich.ts')
    const path = join(input.root, relativePath)
    if (existsSync(path)) plan.already.push(`${relativePath} already exists`)
    else plan.actions.push({ path, relative: relativePath, kind: 'create', contents: nitroEnricherTemplate(input) })
  }

  return plan
}

/** The `sampling` block for a module config, when the extra was selected. */
function samplingProperty(input: WiringInput): string | null {
  if (!input.extras.includes('sampling')) return null
  const preset = findSamplingPreset(input.sampling)
  if (!preset?.rates) return null
  const { info, warn } = preset.rates
  /* `error: 100` is not part of the preset and not a choice: a sampling config
     that drops errors hides the only events anybody reads at 3am. `debug` is
     left out — an unspecified level is kept in full, which is what you want
     from logs somebody switched on to investigate something. */
  return `sampling: {
      rates: { info: ${info}, warn: ${warn}, error: 100 },
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

/**
 * The pieces of a Next.js `lib/evlog.ts`, separately.
 *
 * Split apart because the file is written from scratch in the common case and
 * spliced into an existing one otherwise — and both need the same imports, the
 * same preamble and the same option keys.
 */
interface NextFactoryParts {
  imports: string[]
  /** Statements that go above `createEvlog`. */
  preamble: string
  /** Option keys, each already indented and comma-terminated. */
  options: string[]
}

function nextFactoryParts(input: WiringInput): NextFactoryParts {
  const dev = input.devDrain === 'none' ? null : findDestination(input.devDrain) ?? null
  const prod = input.prodDrains.map(id => findDestination(id)).filter(Boolean) as NonNullable<ReturnType<typeof findDestination>>[]
  const batched = input.extras.includes('pipeline') && prod.length > 0

  const imports: string[] = []
  if (batched) imports.push(`import type { DrainContext } from 'evlog'`)
  for (const destination of [...(dev ? [dev] : []), ...prod]) {
    imports.push(`import { ${destination.factory!.replace('()', '')} } from '${destination.specifier}'`)
  }
  if (batched) imports.push(`import { createDrainPipeline } from 'evlog/pipeline'`)

  const enrichers = input.extras.includes('enrichers')
    ? input.enrichers.map(id => findEnricher(id)).filter(Boolean)
    : []
  if (enrichers.length > 0) {
    const names = enrichers.map(enricher => enricher!.factory.replace('()', '')).sort()
    imports.push(`import {\n${names.map(name => `  ${name},`).join('\n')}\n} from 'evlog/enrichers'`)
  }

  const blocks: string[] = []
  if (batched) {
    blocks.push(`const pipeline = createDrainPipeline<DrainContext>({\n  batch: { size: 50, intervalMs: 5000 },\n  retry: { maxAttempts: 3 },\n})`)
  }

  const wrap = (factory: string) => batched ? `pipeline(${factory})` : factory
  const options: string[] = []

  /* Next has no `import.meta.dev`, so the split is on NODE_ENV — same intent:
     the file sink never runs where it would write to a production box. */
  if (dev && prod.length > 0) {
    blocks.push(`const drains = process.env.NODE_ENV === 'production'\n  ? [${prod.map(d => wrap(d.factory!)).join(', ')}]\n  : [${dev.factory}]`)
    options.push('  drain: async ctx => void await Promise.all(drains.map(drain => drain(ctx))),')
  } else if (prod.length > 0) {
    blocks.push(`const drains = [${prod.map(d => wrap(d.factory!)).join(', ')}]`)
    options.push('  drain: async ctx => void await Promise.all(drains.map(drain => drain(ctx))),')
  } else if (dev) {
    options.push('  // Local NDJSON under .evlog/logs — development only.')
    options.push(`  drain: process.env.NODE_ENV === 'production' ? undefined : ${dev.factory},`)
  }

  if (enrichers.length > 0) {
    blocks.push(`const enrichers = [\n${enrichers.map(enricher => `  ${enricher!.factory},`).join('\n')}\n]`)
    options.push('  enrich: async (ctx) => {\n    for (const enrich of enrichers) await enrich(ctx)\n  },')
  }

  const preset = input.extras.includes('sampling') ? findSamplingPreset(input.sampling) : undefined
  if (preset?.rates) {
    const { info, warn } = preset.rates
    options.push(`  sampling: {\n    rates: { info: ${info}, warn: ${warn}, error: 100 },\n  },`)
  }

  return { imports, preamble: blocks.length > 0 ? `\n${blocks.join('\n\n')}\n` : '', options }
}

function nextLibTemplate(input: WiringInput): string {
  const { imports, preamble, options } = nextFactoryParts(input)
  const all = [`import { createEvlog } from 'evlog/next'`, ...imports]

  return `${all.join('\n')}
${preamble}
export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: '${input.service}',
${options.join('\n')}${options.length > 0 ? '\n' : ''}})
`
}

/**
 * Splice the chosen options into a `lib/evlog.ts` that is already there.
 *
 * Without this, picking Axiom on a project that already has the file left the
 * run reporting "already exists" and wiring the destination nowhere — the
 * command asked a question and then ignored the answer. Patching only works
 * when the file actually calls `createEvlog({ … })`; a re-export barrel or a
 * computed config gets the snippet to paste instead.
 */
function patchNextLib(plan: WiringPlan, input: WiringInput, path: string, relativePath: string): void {
  const { imports, preamble, options } = nextFactoryParts(input)
  if (options.length === 0) {
    plan.already.push(`${relativePath} already exists`)
    return
  }

  const config = readConfig(path)
  const call = config ? findCreateEvlogCall(config.program) : null

  if (!config || !call) {
    plan.manual.push({
      title: 'Wire the destinations into your evlog factory',
      file: relativePath,
      snippet: `${imports.join('\n')}\n${preamble}\ncreateEvlog({\n${options.join('\n')}\n})`,
      reason: `${relativePath} exists but does not call createEvlog({ … }) here — splicing into it would be guesswork`,
    })
    return
  }

  const present = ['drain', 'enrich', 'sampling'].filter(key => hasProperty(call, key))
  if (present.length > 0) {
    plan.manual.push({
      title: 'Reconcile your evlog factory options',
      file: relativePath,
      snippet: options.join('\n'),
      reason: `${relativePath} already sets ${present.join(', ')} — replacing what you wrote is not init's call`,
    })
    return
  }

  const splices: Splice[] = [appendProperty(config.source, call, options.map(line => line.trim()).join('\n  ').replace(/,$/, ''))]

  /* Imports and the statements that use them go in as one splice at one
     offset. As two, they share the same insertion point and the order between
     them is whatever the sort happens to do — which put `const drains = …`
     above the import of the factory it calls. */
  const missing = imports.filter((statement) => {
    const specifier = statement.match(/from '([^']+)'/)?.[1]
    return specifier && !hasImportFrom(config.program, specifier)
  })

  const head = [
    missing.length > 0 ? `\n${missing.join('\n')}` : '',
    preamble.trim().length > 0 ? `\n\n${preamble.trim()}` : '',
  ].join('')

  if (head.length > 0) {
    splices.push({ at: importsEnd(config.source, config.program), text: head })
  }

  plan.actions.push({
    path,
    relative: relativePath,
    kind: 'patch',
    contents: applySplices(config.source, splices),
  })
}

/* ── catalogs, seeded from the scan ─────────────────────────────────────── */

/**
 * An error catalog built from the project's own repeated errors.
 *
 * This is the difference between scaffolding and a suggestion: the entries are
 * the `createError` calls already written in more than one file, so the file
 * lands with the team's real errors in it and the migration is a find and
 * replace rather than a design exercise.
 */
function errorCatalogTemplate(input: WiringInput): string {
  /* Keep the dashes in the wire prefix — `shop-api.CARD_DECLINED` reads, where
     stripping them gives `shopapi`. The variable gets the camelCase spelling
     because that is what an identifier has to be. */
  const prefix = input.service.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'app'
  const identifier = `${prefix.replace(/-(.)/g, (_, char) => char.toUpperCase())}Errors`
  const entries = input.repeatedErrors.map((seed) => {
    const files = seed.files.slice(0, 3).join(', ')
    const status = seed.status ? `\n    status: ${seed.status},` : ''
    const why = seed.why ? quote(seed.why) : `'TODO: what went wrong, in the reader\\'s terms'`
    return `  /** Currently written inline in ${files}${seed.files.length > 3 ? ', …' : ''} */
  ${seed.key}: {${status}
    message: ${quote(seed.message)},
    why: ${why},
    fix: 'TODO: what they should do about it',
  },`
  })

  return `import { defineErrorCatalog } from 'evlog'

/**
 * Typed errors for ${input.service}.
 *
 * Seeded by \`evlog init\` from errors this project already repeats across
 * files. Fill in \`why\` and \`fix\` — they are what turn a stack trace into
 * something a reader, or an agent, can act on — then replace the inline
 * \`createError\` calls with \`${identifier}.<KEY>()\`.
 */
export const ${identifier} = defineErrorCatalog('${prefix}', {
${entries.join('\n')}
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    '${prefix}': typeof ${identifier}
  }
}
`
}

/**
 * Audit actions for the sensitive routes the scan found without a trail.
 *
 * Same principle as the error catalog: the actions are named after the routes
 * that need them, so the file is a to-do list with the types already written
 * rather than an empty example.
 */
function auditCatalogTemplate(input: WiringInput): string {
  const seen = new Set<string>()
  const entries = input.auditGaps.map((gap) => {
    let name = auditActionName(gap)
    while (seen.has(name)) name = `${name}2`
    seen.add(name)

    const constant = name.replace(/[^a-z0-9]+/gi, '_').toUpperCase()
    const target = gap.path.split('/').filter(Boolean).at(-1)?.replace(/[^a-z0-9]/gi, '') || 'resource'
    const why = gap.reasons.length > 0 ? ` — flagged for ${gap.reasons.join(', ')}` : ''

    return `/** ${gap.method ?? 'ANY'} ${gap.path}${why} */
export const ${constant} = defineAuditAction('${name}', {
  target: '${target}',
  description: 'TODO: what this records, in one line',
})`
  })

  return `import { defineAuditAction } from 'evlog'

/**
 * Audit actions for ${input.service}.
 *
 * Seeded by \`evlog init\` from the entry points \`evlog map\` flagged as
 * sensitive with no audit trail. Call them from the handlers listed above each
 * one:
 *
 *   log.audit(${entries.length > 0 ? [...seen][0]!.replace(/[^a-z0-9]+/gi, '_').toUpperCase() : 'ACTION'}({ actor: { type: 'user', id: user.id }, outcome: 'success' }))
 */
${entries.join('\n\n')}
`
}

/**
 * A single-quoted string literal.
 *
 * Generated files land in someone's repository and go through their linter;
 * `JSON.stringify` would emit double quotes and fail the check on the majority
 * of TypeScript projects, which style on single.
 */
function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`
}

/** Where a catalog file goes, per framework convention. */
function catalogDir(input: WiringInput): string {
  if (input.framework === 'next') {
    const useSrc = existsSync(join(input.root, 'src', 'app')) || existsSync(join(input.root, 'src', 'pages'))
    return useSrc ? join('src', 'lib') : 'lib'
  }
  if (input.framework === 'tanstack-start') return join('src', 'lib')
  return join('server', 'utils')
}

function withCatalogs(plan: WiringPlan, input: WiringInput): WiringPlan {
  const dir = catalogDir(input)

  if (input.extras.includes('error-catalog') && input.repeatedErrors.length > 0) {
    addFile(plan, input, join(dir, 'errors.ts'), errorCatalogTemplate(input))
  }
  if (input.extras.includes('audit-catalog') && input.auditGaps.length > 0) {
    addFile(plan, input, join(dir, 'audit.ts'), auditCatalogTemplate(input))
  }

  return plan
}

/** Queue a file, or report it as already present. Never overwrites. */
function addFile(plan: WiringPlan, input: WiringInput, relativePath: string, contents: string): void {
  const path = join(input.root, relativePath)
  if (existsSync(path)) {
    plan.already.push(`${relativePath} already exists`)
    return
  }
  plan.actions.push({ path, relative: relativePath, kind: 'create', contents })
}

/* ── environment ────────────────────────────────────────────────────────── */

/**
 * Append the chosen adapters' variables to `.env.example`.
 *
 * `.env.example` and never `.env`: the example file is documentation and is
 * committed, the real one holds secrets and is not something a setup command
 * should be editing. Keys already present are left alone.
 */
function withEnvExample(plan: WiringPlan, input: WiringInput): WiringPlan {
  const variables = input.prodDrains
    .map(id => findDestination(id))
    .flatMap(destination => destination?.env ?? [])
  if (variables.length === 0) return plan

  const path = join(input.root, '.env.example')
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const missing = variables.filter(variable => !new RegExp(`^\\s*${variable.name}\\s*=`, 'm').test(existing))

  if (missing.length === 0) {
    plan.already.push('.env.example already lists the adapter keys')
    return plan
  }

  const width = Math.max(...missing.map(variable => variable.name.length))
  const block = [
    '# evlog — wide event delivery',
    ...missing.map(variable => `${`${variable.name}=`.padEnd(width + 2)}# ${variable.hint}`),
    '',
  ].join('\n')
  const contents = existing.length > 0
    ? `${existing.replace(/\n*$/, '\n')}\n${block}`
    : block

  plan.actions.push({
    path,
    relative: '.env.example',
    kind: existing.length > 0 ? 'patch' : 'create',
    contents,
  })
  return plan
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
    patchNextLib(plan, input, lib, relative(input.root, lib))
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
  const plan = frameworkPlan(input)
  /* Catalogs and the env example are framework-shaped only in where they land,
     so they are applied once here rather than repeated in each planner — which
     is how the Next planner ended up being the only one that wrote them. */
  return withEnvExample(withCatalogs(plan, input), input)
}

function frameworkPlan(input: WiringInput): WiringPlan {
  switch (input.framework) {
    case 'nuxt': return planNuxt(input)
    case 'nitro':
    case 'tanstack-start': return planNitro(input)
    case 'next': return planNext(input)
  }
}
