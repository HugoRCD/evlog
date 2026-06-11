import { resolve } from 'pathe'
import { defineNitroConfig } from 'nitropack/config'

const evlogRoot = resolve(__dirname, '../../../src')

export default defineNitroConfig({
  compatibilityDate: '2026-06-11',
  errorHandler: resolve(evlogRoot, 'nitro/errorHandler.ts'),
  alias: {
    'evlog': resolve(evlogRoot, 'index.ts'),
  },
})
