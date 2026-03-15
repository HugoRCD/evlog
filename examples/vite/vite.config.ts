import evlog from 'evlog/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    evlog({
      service: 'vite-example',
      autoImports: true,
      strip: ['debug'],
      sourceLocation: true,
    }),
  ],
})
