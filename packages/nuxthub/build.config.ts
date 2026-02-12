import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  externals: [
    'consola',
    'nitropack',
    'nitropack/runtime',
    'nitropack/types',
    'h3',
    '@nuxthub/db',
  ],
})
