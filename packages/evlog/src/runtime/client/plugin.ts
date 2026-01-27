import { initLog } from './log'
import { defineNuxtPlugin, useRuntimeConfig } from '#app'

interface EvlogPublicConfig {
  pretty?: boolean
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const evlogConfig = config.public?.evlog as EvlogPublicConfig | undefined

  initLog({
    pretty: evlogConfig?.pretty ?? import.meta.dev,
    service: 'client',
  })
})
