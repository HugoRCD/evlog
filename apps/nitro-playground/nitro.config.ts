import { defineConfig } from 'nitro'
import evlog from 'evlog/nitro/v3'

export default defineConfig({
  serverDir: './',
  modules: [
    evlog({
      env: {
        service: 'nitro-playground'
      }
    })
  ],
})
