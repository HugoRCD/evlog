import { articleSchema } from '../utils/structured-data'

/**
 * The key Docus caches a page under.
 *
 * Its `[...slug].vue` calls `useAsyncData(kebabCase(route.path), ...)`, and on a
 * lowercase path `kebabCase` only turns the separators into dashes. Reading that
 * cache costs no second query. If Docus ever changes the key, no schema is
 * emitted and nothing else breaks.
 */
const cacheKey = (path: string) => path.replace(/[/._]/g, '-')

/**
 * `TechArticle` and `BreadcrumbList` on every docs page.
 *
 * The page is read from the cache Docus already filled: its `[...slug].vue`
 * keys `useAsyncData` on `kebabCase(route.path)`, so this costs no second query
 * and cannot describe a page the reader is not on. The landing has no entry
 * there and carries its own `SoftwareApplication` and `FAQPage` instead.
 */
export default defineNuxtPlugin(() => {
  const route = useRoute()

  useHead(() => {
    const page = useNuxtData<{ title?: string, description?: string }>(cacheKey(route.path)).data.value
    if (!page || route.path === '/') return {}

    return {
      script: [{ type: 'application/ld+json', innerHTML: JSON.stringify(articleSchema({ path: route.path, title: page.title, description: page.description })) }],
    }
  })
})
