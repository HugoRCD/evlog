import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'drains/index': 'src/drains/index.ts',
    'scorers/ai': 'src/scorers/ai.ts',
  },
  format: 'esm',
  dts: true,
  clean: true,
  fixedExtension: true,
  external: [
    'evlog',
    'ai',
    '@ai-sdk/provider',
  ],
})
