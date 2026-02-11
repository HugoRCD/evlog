import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'module': 'src/module.ts',
    'schema/sqlite': 'src/schema/sqlite.ts',
    'schema/postgresql': 'src/schema/postgresql.ts',
    'schema/mysql': 'src/schema/mysql.ts',
  },
  format: 'esm',
  dts: true,
  clean: true,
  fixedExtension: true,
  external: [
    '@nuxt/kit',
    'nitropack',
    'nitropack/runtime',
    'h3',
    'drizzle-orm',
    'drizzle-orm/sqlite-core',
    'drizzle-orm/pg-core',
    'drizzle-orm/mysql-core',
    'evlog',
  ],
})
