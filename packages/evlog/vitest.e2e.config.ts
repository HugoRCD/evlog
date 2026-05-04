import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/e2e/**/*.e2e.ts'],
    environment: 'node',
    // Real network: be patient.
    testTimeout: 90_000,
    hookTimeout: 30_000,
    // Serial execution avoids hammering rate limits and keeps the output
    // readable when something breaks against a real platform.
    pool: 'forks',
    forks: { singleFork: true },
    fileParallelism: false,
    globalSetup: ['./test/e2e/setup.ts'],
    reporters: ['verbose'],
  },
})
