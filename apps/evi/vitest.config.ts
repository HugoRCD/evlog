import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['agent/**/*.test.ts', 'evals/**/*.test.ts'],
    environment: 'node',
  },
})
