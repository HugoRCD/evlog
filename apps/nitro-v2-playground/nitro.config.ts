import { defineNitroConfig } from 'nitropack/config'
import evlog from 'evlog/nitro'

export default defineNitroConfig({
  modules: [
    evlog({
      env: {
        service: 'nitro-v2-playground'
      }
    })
  ],
})
