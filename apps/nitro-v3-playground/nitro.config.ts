import { defineConfig } from 'nitro'

export default defineConfig({
  serverDir: './',
  // TODO: make playground work with evlog/nitro/v3
  plugins: ['../../packages/evlog/src/nitro-v3/plugin.ts'],
  errorHandler: "../../packages/evlog/src/nitro-v3/errorHandler.ts"
})
