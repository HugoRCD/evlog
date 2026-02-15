import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  externals: [
    'evlog',
    'drizzle-orm',
    '@nuxthub/core',
    '@nuxthub/db',
    'consola',
    'nitropack',
    'nitropack/runtime',
    'nitropack/types',
    'h3',
  ],
})
