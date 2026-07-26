import type { FileFacts } from '../facts'
import type { ProjectFacts, RepeatedError } from '../project-facts'
import { HANDLER_KINDS } from './types'
import type { MapRule } from './types'

/**
 * The same error is written out in several handlers — should it be a catalog entry?
 *
 * Deliberately narrow. An earlier version fired on any inline `createError()`,
 * which meant five of six handlers got a suggestion for writing perfectly good
 * errors — that is policing, not helping. Duplication is the one signal that
 * makes the case on its own: the same status and message maintained in three
 * places will drift, and a catalog is exactly the fix for that.
 *
 * Also gated on the project already declaring a catalog, so the suggestion can
 * point at something that exists instead of pitching a feature.
 */
export const errorCatalogRule = {
  id: 'error-catalog',
  category: 'opportunity',
  title: 'catalog',
  expects: 'catalog error',
  question: 'Should these duplicated errors become catalog entries?',
  docs: '/learn/catalogs',
  appliesTo: {
    kinds: HANDLER_KINDS,
    when: ({ project, facts }) =>
      project.features.has('error-catalog') && findDuplicate(facts, project) !== null,
  },

  suggest({ project }) {
    const [catalog] = project.catalogs
    const name = catalog ?? 'billing'
    const constant = `${name}Errors`
    return [
      `// add the entry to your ${name} catalog`,
      `export const ${constant} = defineErrorCatalog('${name}', {`,
      '  PAYMENT_DECLINED: { status: 402, message: \'Card declined\' },',
      '})',
      '',
      '// then, in every handler that used to spell it out',
      `throw ${constant}.PAYMENT_DECLINED()`,
    ]
  },

  create(context) {
    const { facts, project } = context
    return {
      onEnd() {
        const duplicate = findDuplicate(facts, project)
        if (!duplicate) return
        const { repeated, line } = duplicate
        const elsewhere = repeated.files.length - 1
        const others = elsewhere === 1 ? '1 other file' : `${elsewhere} other files`
        context.report({
          message: `"${repeated.label}" is spelled out here and in ${others} — one catalog entry would cover them`,
          line,
        })
      },
    }
  },
} satisfies MapRule

/** The first inline error in this file that also exists somewhere else. */
function findDuplicate(
  facts: FileFacts,
  project: ProjectFacts,
): { repeated: RepeatedError, line: number } | null {
  for (const error of facts.inlineErrors) {
    const repeated = project.repeatedErrors.get(error.signature)
    if (repeated) return { repeated, line: error.line }
  }
  return null
}
