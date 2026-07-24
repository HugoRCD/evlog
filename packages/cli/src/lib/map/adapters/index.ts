import type { Framework, FrameworkAdapter } from '../types'
import { nextAdapter } from './next'
import { getNuxtOrNitroAdapter } from './nuxt'
import { tanstackStartAdapter } from './tanstack-start'

/** Resolve the route-extraction adapter for a detected framework. */
export function getAdapter(framework: Framework): FrameworkAdapter {
  switch (framework) {
    case 'nuxt':
    case 'nitro':
      return getNuxtOrNitroAdapter(framework)
    case 'next':
      return nextAdapter
    case 'tanstack-start':
      return tanstackStartAdapter
  }
}
