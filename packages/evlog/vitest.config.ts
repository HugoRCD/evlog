import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    hookTimeout: 30_000,
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/nuxt/**', 'src/nitro/**', 'src/runtime/**'],
    },
  },
})
