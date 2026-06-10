import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    citty: 'src/citty.ts',
    http: 'src/http.ts',
  },
  format: 'esm',
  dts: true,
  clean: true,
  fixedExtension: true,
  external: ['evlog', 'citty', 'ofetch'],
})
