import evlog from 'evlog/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // This example is a Hono server, not a browser app: without an explicit ssr
  // entry `vite build` looks for an index.html that does not exist. Building
  // src/server.ts is also what the `start` script expects to run.
  build: {
    ssr: 'src/server.ts',
    outDir: 'dist',
  },
  plugins: [
    evlog({
      service: 'vite-example',
      sourceLocation: true,
    }),
  ],
})
